import { FormEvent, KeyboardEvent, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Category } from '../../interfaces';
import { actionCreators } from '../../store';
import { State } from '../../store/reducers';
import { redirectUrl, searchParser } from '../../utility';
import { resolveAppUrl } from '../../utility/appUrl';
import classes from './SearchBar.module.css';

// Redux
// Typescript
// CSS
// Utils
interface Props {
  setLocalSearch: (query: string) => void;
  appSearchResult: Category[] | null;
  bookmarkSearchResult: Category[] | null;
}

export const SearchBar = (props: Props): JSX.Element => {
  const { config, loading } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { createNotification } = bindActionCreators(actionCreators, dispatch);

  const { setLocalSearch, appSearchResult, bookmarkSearchResult } = props;

  const inputRef = useRef<HTMLInputElement>(document.createElement('input'));

  // Search bar autofocus
  useEffect(() => {
    if (!loading && !config.disableAutofocus) {
      inputRef.current.focus();
    }
  }, [config]);

  // Listen for keyboard events outside of search bar
  useEffect(() => {
    const keyOutsideFocus = (e: any) => {
      const { key } = e as KeyboardEvent;

      if (key === 'Escape') {
        clearSearch();
      } else if (document.activeElement !== inputRef.current) {
        if (key === '`') {
          inputRef.current.focus();
          clearSearch();
        }
      }
    };

    window.addEventListener('keyup', keyOutsideFocus);

    return () => window.removeEventListener('keyup', keyOutsideFocus);
  }, []);

  const clearSearch = () => {
    inputRef.current.value = '';
    setLocalSearch('');
  };

  const searchTypingHandler = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.code === 'Escape') {
      clearSearch();
    } else if (e.code !== 'Enter' && e.code !== 'NumpadEnter') {
      executeSearch(false)
    }
  }

  const executeSearch = (redirectToResult: boolean) => {
    const {
      isLocal,
      encodedURL,
      primarySearch,
      secondarySearch,
      isURL,
      sameTab,
      rawQuery,
    } = searchParser(inputRef.current.value);

    if (isLocal) {
      setLocalSearch(encodedURL);
    }

    if (redirectToResult) {
      if (!primarySearch.prefix) {
        // Prefix not found -> emit notification
        createNotification({
          title: 'Error',
          message: 'Prefix not found',
        });
      } else if (isURL) {
        // URL or IP passed -> redirect
        redirectUrl(inputRef.current.value, sameTab, config.extraUrlSchemes);
      } else if (isLocal) {
        // Local query -> redirect if at least 1 result found
        if (appSearchResult?.[0]?.apps?.length) {
          redirectUrl(
            resolveAppUrl(appSearchResult[0].apps[0]).url,
            sameTab,
            config.extraUrlSchemes
          );
        } else if (bookmarkSearchResult?.[0]?.bookmarks?.length) {
          redirectUrl(
            bookmarkSearchResult[0].bookmarks[0].url,
            sameTab,
            config.extraUrlSchemes
          );
        } else {
          // no local results -> search the internet with the default search provider if query is not empty
          if (!/^ *$/.test(rawQuery)) {
            let template = primarySearch.template;

            if (primarySearch.prefix === 'l') {
              template = secondarySearch.template;
            }

            const url = `${template}${encodedURL}`;
            redirectUrl(url, sameTab, config.extraUrlSchemes);
          }
        }
      } else {
        // Valid query -> redirect to search results
        const url = `${primarySearch.template}${encodedURL}`;
        redirectUrl(url, sameTab, config.extraUrlSchemes);
      }
    }
  };

  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    executeSearch(true);
    e.preventDefault()
  }


  return (
    <div className={classes.SearchContainer}>
      <form id="searchForm" onSubmit={(e) => submitSearch(e)}>
      <input
        ref={inputRef}
        type="text"
        className={classes.SearchBar}
        onKeyUp={(e) => searchTypingHandler(e)}
        onDoubleClick={clearSearch}
      />
      </form>
    </div>
  );
};
