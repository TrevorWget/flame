import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

import { Category } from '../../../interfaces';
import { State } from '../../../store/reducers';
import { useMasonry } from '../../Home/Masonry/useMasonry';
import { Message } from '../../UI';
import { BookmarkCard } from '../BookmarkCard/BookmarkCard';
import classes from './BookmarkGrid.module.css';

interface Props {
  categories: Category[];
  totalCategories?: number;
  searching: boolean;
  fromHomepage?: boolean;
}

export const BookmarkGrid = (props: Props): JSX.Element => {
  const {
    categories,
    totalCategories,
    searching,
    fromHomepage = false,
  } = props;

  const config = useSelector((state: State) => state.config.config);

  const shouldBeShown = (category: Category) => {
    return !config.hideEmptyCategories || category.bookmarks.length > 0 || !fromHomepage
  }

  const shown = categories.filter(shouldBeShown);
  const masonry = useMasonry<HTMLDivElement>(
    fromHomepage,
    shown.map(() => false)
  );

  let bookmarks: JSX.Element;

  if (categories.length && categories.some(shouldBeShown)) {
    if (searching && !categories[0].bookmarks.length) {
      bookmarks = <Message>No bookmarks match your search criteria</Message>;
    } else {
      bookmarks = (
        <div
          className={`${classes.BookmarkGrid} ${masonry.className}`}
          ref={masonry.ref}
        >
          {shown.map(
            (category: Category): JSX.Element => (
              <BookmarkCard
                category={category}
                fromHomepage={fromHomepage}
                collapsible={fromHomepage && !searching}
                key={category.id}
              />
            )
          )}
        </div>
      );
    }
  } else {
    if (totalCategories && !config.hideEmptyCategories) {
      bookmarks = (
        <Message>
          There are no pinned categories. You can pin them from the{' '}
          <Link to="/bookmarks">/bookmarks</Link> menu
        </Message>
      );
    } else {
      bookmarks = (
        <Message>
          You don't have any bookmarks. You can add a new one from{' '}
          <Link to="/bookmarks">/bookmarks</Link> menu
        </Message>
      );
    }
  }

  return bookmarks;
};
