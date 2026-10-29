import { App } from '../../interfaces';
import { sortData } from '../../utility';
import { ActionType } from '../action-types';
import { Action } from '../actions';
import { categoriesReducer, CategoriesState } from './category';

interface AppsState extends CategoriesState {
  appInEdit: App | null;
}

const initialState: AppsState = {
  loading: true,
  errors: undefined,
  categories: [],
  type: 'apps',
  categoryInEdit: null,
  appInEdit: null,
};

export const appsReducer = (
  state: AppsState = initialState,
  action: Action
): AppsState => {
  switch (action.type) {
    
    case ActionType.addApp: {
      const categoryIdx = state.categories.findIndex(
        (category) => category.id === action.payload.categoryId
      );

      const targetCategory = {
        ...state.categories[categoryIdx],
        apps: [...state.categories[categoryIdx].apps, action.payload],
      };

      return {
        ...state,
        categories: [
          ...state.categories.slice(0, categoryIdx),
          targetCategory,
          ...state.categories.slice(categoryIdx + 1),
        ],
        categoryInEdit: targetCategory,
      };
    }

    case ActionType.deleteApp: {
      const categoryIdx = state.categories.findIndex(
        (category) => category.id === action.payload.categoryId
      );

      const targetCategory = {
        ...state.categories[categoryIdx],
        apps: state.categories[categoryIdx].apps.filter(
          (app) => app.id !== action.payload.appId
        ),
      };

      return {
        ...state,
        categories: [
          ...state.categories.slice(0, categoryIdx),
          targetCategory,
          ...state.categories.slice(categoryIdx + 1),
        ],
        categoryInEdit: targetCategory,
      };
    }

    case ActionType.pinApp:
    case ActionType.updateApp: {
      const categoryIdx = state.categories.findIndex(
        (category) => category.id === action.payload.categoryId
      );

      const appIdx = state.categories[categoryIdx].apps.findIndex(
        (app) => app.id === action.payload.id
      );

      const targetCategory = {
        ...state.categories[categoryIdx],
        apps: [
          ...state.categories[categoryIdx].apps.slice(0, appIdx),
          action.payload,
          ...state.categories[categoryIdx].apps.slice(appIdx + 1),
        ],
      };

      return {
        ...state,
        categories: [
          ...state.categories.slice(0, categoryIdx),
          targetCategory,
          ...state.categories.slice(categoryIdx + 1),
        ],
        categoryInEdit: targetCategory,
      };
    }

    case ActionType.setEditApp: {
      return {
        ...state,
        appInEdit: action.payload,
      };
    }

    case ActionType.reorderApps: {
      const categoryIdx = state.categories.findIndex(
        (category) => category.id === action.payload.categoryId
      );

      return {
        ...state,
        categories: [
          ...state.categories.slice(0, categoryIdx),
          {
            ...state.categories[categoryIdx],
            apps: action.payload.apps,
          },
          ...state.categories.slice(categoryIdx + 1),
        ],
      };
    }

    case ActionType.sortApps: {
      const categoryIdx = state.categories.findIndex(
        (category) => category.id === action.payload.categoryId
      );

      const sortedApps = sortData<App>(
        state.categories[categoryIdx].apps,
        action.payload.orderType
      );

      return {
        ...state,
        categories: [
          ...state.categories.slice(0, categoryIdx),
          {
            ...state.categories[categoryIdx],
            apps: sortedApps,
          },
          ...state.categories.slice(categoryIdx + 1),
        ],
      };
    }

    default:
      return categoriesReducer(state, action);
  }
};
