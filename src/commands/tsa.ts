import timeseries from 'timeseries-analysis';
import timestring from 'timestring';
import { IPluggableCommand } from '@simple-cli/base';
import { ITSAPluginArgs, TSAPluginResult, ITSAPluginResult } from '../types';

enum SortType {
	min = 'min',
	max = 'max',
	mean = 'mean',
}

enum SortDirection {
	asc = 'asc',
	desc = 'desc',
}

const rangeOptions = {
	options: [
		{
			name: 'since',
			type: String,
			description: 'Time to start computing stats. Can be relative from --until or absolute.',
		},
		{
			name: 'until',
			type: String,
			description:
				'Time to stop computing stats. Can be "now" (default), relative to now, or absolute',
		},
		{
			name: 'step',
			type: String,
			description:
				'Interval between each data point. Defaults to the larger of 1000 points total, or 30',
		},
		{
			name: 'aggregate',
			type: Boolean,
			description: 'When processing multiple series, process them all as one series.',
		},
		{
			name: 'sort-by',
			type: String,
			description: 'Sort output by this stat. One of [min|max|mean].',
		},
		{
			name: 'sort-direction',
			type: String,
			description: 'Sort output in this direction. One of [asc|desc].',
		},
	],
	validate: () => true,
	populateOptions: () => ({}),
};

interface ITSAOptions {
	since: string;
	until: string;
	step: string;
	aggregate: boolean;

	// eslint-disable-next-line @typescript-eslint/naming-convention
	'sort-by': SortType;

	// eslint-disable-next-line @typescript-eslint/naming-convention
	'sort-direction': SortDirection;
}

interface IDataPoint {
	min: number;
	max: number;
	mean: number;
}

function getSortableStat(data: IDataPoint, sortType: SortType) {
	return data[sortType];
}

const name = 'null';
const summary = 'Runs a time-series analysis.';

function toDisplay(n: number) {
	return parseFloat(n.toFixed(2));
}

export const tsa: IPluggableCommand<ITSAOptions, ITSAPluginArgs, TSAPluginResult> = {
	name,
	summary,
	definitions: [...rangeOptions.options],
	usage: [
		{
			header: `tsa`,
			content: summary,
		},
		{
			header: 'Synopsis',
			content: `$ tsa <options>`,
		},
	],
	populateOptions: () => ({
		...rangeOptions.populateOptions(),
	}),
	validate: () => rangeOptions.validate(),
	execute: async ({ options }) => {
		const { since, until, step, plugin, aggregate } = options;
		const untilMS =
			!until || until.toLowerCase() === 'now'
				? Date.now()
				: Date.now() - timestring(until, 'ms', {});
		const sinceMS = untilMS - ((!since && 3600000) || timestring(since, 'ms', {}));
		const resolvedStep = Math.max(30, (step && parseInt(step, 10)) || (untilMS - sinceMS) / 1000);

		const result = await plugin.execute(
			{ start: sinceMS, end: untilMS, step: resolvedStep },
			options
		);

		if (Array.isArray(result)) {
			const t = new timeseries.main(result);
			console.log(`Min: ${t.min()} Max: ${t.max()} Mean: ${t.mean()}`);
		} else if (aggregate) {
			const { data } = result as ITSAPluginResult;
			const series = Object.keys(data).flatMap((k) => data[k]);
			const t = new timeseries.main(series);
			console.log(`Min: ${t.min()} Max: ${t.max()} Mean: ${t.mean()}`);
		} else {
			const { data } = result as ITSAPluginResult;
			const processed = Object.keys(data).map((label) => {
				const series = new timeseries.main(data[label]);
				const min = series.min() as number;
				const max = series.max() as number;
				const mean = series.mean() as number;
				return {
					label,
					series,
					min,
					max,
					mean,
				};
			});

			const sortBy = options['sort-by'] ?? SortType.mean;
			const sortDirection = options['sort-direction'] ?? SortDirection.desc;
			processed.sort((a, b) => {
				const low = sortDirection === SortDirection.asc ? a : b;
				const high = sortDirection === SortDirection.asc ? b : a;
				return getSortableStat(low, sortBy) - getSortableStat(high, sortBy);
			});

			const display = processed.reduce<{ [key: string]: IDataPoint }>((acc, v) => {
				const { label, min, max, mean } = v;
				acc[label] = { min: toDisplay(min), max: toDisplay(max), mean: toDisplay(mean) };
				return acc;
			}, {});
			console.table(display);
		}

		return { code: 0 };
	},
};
