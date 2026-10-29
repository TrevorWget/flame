import { Category } from '../../interfaces';
import { sortData } from '../../utility';
import { ActionType } from '../action-types';
import { Action } from '../actions';

export interface CategoriesState {
  loading: boolean;
  errors: string | undefined;
  categories: Category[];
  categoryInEdit: Category | null;
  type: string;
}

export const categoriesReducer = <T extends CategoriesState>(
  state: T,
  action: Action
): T => {
  switch (action.type) {
    case ActionType.getCategories: {
      return {
        ...state,
        loading: true,
        errors: undefined,
      };
    }

    case ActionType.getCategoriesSuccess: {
      return {
        ...state,
        loading: false,
        categories: action.payload.filter((c: Category) => c.type === state.type),
      };
    }

    case ActionType.addCategory: {
      if (action.payload.type !== state.type) return state;

      return {
        ...state,
        categories: [...state.categories, { ...action.payload, apps: [], bookmarks: [] }],
      };
    }

    case ActionType.pinCategory:
    case ActionType.updateCategory: {
      const categoryIdx = state.categories.findIndex(
        (category) => category.id === action.payload.id
      );

      if (categoryIdx < 0) return state;

      // Editing a category never changes its apps/bookmarks, and the ones in
      // state keep their client-side sort order
      const { apps, bookmarks } = state.categories[categoryIdx];

      return {
        ...state,
        categories: [
          ...state.categories.slice(0, categoryIdx),
          { ...action.payload, apps, bookmarks },
          ...state.categories.slice(categoryIdx + 1),
        ],
      };
    }

    case ActionType.deleteCategory: {
      const categoryIdx = state.categories.findIndex(
        (category) => category.id === action.payload
      );

      if (categoryIdx < 0) return state;

      return {
        ...state,
        categories: [
          ...state.categories.slice(0, categoryIdx),
          ...state.categories.slice(categoryIdx + 1),
        ],
      };
    }

    case ActionType.sortCategories: {
      return {
        ...state,
        categories: sortData<Category>(state.categories, action.payload),
      };
    }

    case ActionType.reorderCategories: {
      return {
        ...state,
        categories: action.payload.filter((c: Category) => c.type === state.type),
      };
    }

    case ActionType.setEditCategory: {
      return {
        ...state,
        categoryInEdit: action.payload,
      };
    }

    default:
      return state;
  }
};
