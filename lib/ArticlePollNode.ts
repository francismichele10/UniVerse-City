import { Node, mergeAttributes } from '@tiptap/core';

export const ArticlePollNode = Node.create({
  name: 'articlePoll',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      pollId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-poll-id'),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-article-poll]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-article-poll': 'true',
        'data-poll-id': HTMLAttributes.pollId,
        class: 'article-poll-placeholder',
      }),
      '📊 Article poll — readers can vote on the published article.',
    ];
  },
});
