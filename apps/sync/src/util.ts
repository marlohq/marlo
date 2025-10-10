function reduceComparator(
	items: { updatedAt: Date }[],
	startValue: Date | undefined,
	comparator: (a: Date, b: Date) => boolean,
) {
	return items.reduce((date, item) => {
		if (!date || comparator(item.updatedAt, date)) {
			return item.updatedAt;
		}
		return date;
	}, startValue);
}

export function findHighest(items: { updatedAt: Date }[], startValue?: Date) {
	return reduceComparator(items, startValue, (a, b) => a > b);
}

export function highestDate(a: Date | undefined, b: Date | undefined) {
	if (!a) return b;
	if (!b) return a;
	return a > b ? a : b;
}

function getDateOneMillisecondsLater(dateISO: string | Date) {
	const date = new Date(dateISO);
	date.setMilliseconds(date.getMilliseconds() + 1);
	return date;
}

export function getDateOneMillisecondsLaterIfExists(dateISO: string | Date | undefined) {
	return dateISO ? getDateOneMillisecondsLater(dateISO) : undefined;
}
