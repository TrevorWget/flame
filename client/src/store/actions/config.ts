import { ActionType } from '../action-types';
import { Config, Query } from '../../interfaces';

export interface GetConfigAction {
  type: ActionType.getConfig;
  payload: Partial<Config>;
}

export interface GetAdminConfigAction {
  type: ActionType.getAdminConfig;
  payload: Config;
}

export interface UpdateConfigAction {
  type: ActionType.updateConfig;
  payload: Config;
}

export interface FetchQueriesAction {
  type: ActionType.fetchQueries;
  payload: Query[];
}

export interface AddQueryAction {
  type: ActionType.addQuery;
  payload: Query;
}

export interface DeleteQueryAction {
  type: ActionType.deleteQuery;
  payload: Query[];
}

export interface UpdateQueryAction {
  type: ActionType.updateQuery;
  payload: Query[];
}
