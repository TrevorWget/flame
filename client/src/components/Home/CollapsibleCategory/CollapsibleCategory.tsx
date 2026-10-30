import { mdiChevronDown } from '@mdi/js';
import { Icon } from '@mdi/react';
import { useId, useLayoutEffect, useRef } from 'react';

import { Category } from '../../../interfaces';
import { useCollapsedCategory } from '../../../utility/collapsedCategories';
import { prefersReducedMotion } from '../Masonry/useMasonry';
import classes from './CollapsibleCategory.module.css';

interface ToggleProps {
  name: string;
  collapsed: boolean;
  contentId: string;
  onToggle: () => void;
}

export const CategoryToggle = (props: ToggleProps): JSX.Element => {
  const { name, collapsed, contentId, onToggle } = props;

  return (
    <button
      type="button"
      className={classes.Toggle}
      aria-expanded={!collapsed}
      aria-controls={contentId}
      onClick={onToggle}
    >
      {name}
      <Icon path={mdiChevronDown} size="1.1em" className={classes.Chevron} />
    </button>
  );
};

interface CollapsibleCategory {
  className: string;
  title: JSX.Element | string;
  contentClassName: string;
  contentId?: string;
}

// Lets a homepage category card be collapsed by clicking its name. Cards
// that aren't collapsible get a plain title and no extra classes.
export const useCollapsibleCategory = (
  category: Category,
  enabled: boolean
): CollapsibleCategory => {
  const [collapsed, toggle] = useCollapsedCategory(category.id);
  const contentId = useId();
  const wasCollapsed = useRef(collapsed);

  useLayoutEffect(() => {
    const expanded = wasCollapsed.current && !collapsed;
    wasCollapsed.current = collapsed;

    const content = document.getElementById(contentId);

    if (enabled && expanded && content?.animate && !prefersReducedMotion()) {
      content.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 250,
        easing: 'ease-out',
      });
    }
  }, [collapsed, contentId, enabled]);

  if (!enabled) {
    return { className: '', title: category.name, contentClassName: '' };
  }

  return {
    className: collapsed
      ? `${classes.Collapsible} ${classes.Collapsed}`
      : classes.Collapsible,
    title: (
      <CategoryToggle
        name={category.name}
        collapsed={collapsed}
        contentId={contentId}
        onToggle={toggle}
      />
    ),
    contentClassName: classes.Content,
    contentId,
  };
};
