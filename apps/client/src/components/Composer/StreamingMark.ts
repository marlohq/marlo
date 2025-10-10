import { Mark, mergeAttributes, type NodeViewRendererProps } from '@tiptap/core';

export const STREAMING_MARK_NAME = 'streaming';

export const StreamingMark = Mark.create<{
	HTMLAttributes: NodeViewRendererProps['HTMLAttributes'];
}>({
	name: STREAMING_MARK_NAME,

	addOptions() {
		return { HTMLAttributes: {} };
	},

	parseHTML() {
		return [{ tag: `span[data-mark-type="${STREAMING_MARK_NAME}"]` }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			'span',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
				'data-mark-type': STREAMING_MARK_NAME,
			}),
			0,
		];
	},
});
