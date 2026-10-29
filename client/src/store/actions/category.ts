import { Category } from '../../interfaces';
import { ActionType } from '../action-types';

export interface GetCategoriesAction<T> {
  type:
    | ActionType.getCategories
    | ActionType.getCategoriesSuccess
    | ActionType.getCategoriesError;
  payload: T;
}

export interface AddCategoryAction {
  type: ActionType.addCategory;
  payload: Category;
}

export interface PinCategoryAction {
  type: ActionType.pinCategory;
  payload: Category;
}

export interface DeleteCategoryAction {
  type: ActionType.deleteCategory;
  payload: number;
}

export interface UpdateCategoryAction {
  type: ActionType.updateCategory;
  payload: Category;
}

export interface SortCategoriesAction {
  type: ActionType.sortCategories;
  payload: string;
}

export interface ReorderCategoriesAction {
  type: ActionType.reorderCategories;
  payload: Category[];
}

export interface SetEditCategoryAction {
  type: ActionType.setEditCategory;
  payload: Category | null;
}

/** Replaces the app or bookmark categories after items were dragged around */
export interface ArrangeItemsAction {
  type: ActionType.arrangeItems;
  payload: {
    type: 'apps' | 'bookmarks';
    categories: Category[];
  };
}
