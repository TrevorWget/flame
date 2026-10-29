import { Action } from '../actions';
import { ActionType } from '../action-types';
import { Config, Query } from '../../interfaces';
import { configTemplate } from '../../utility';

interface ConfigState {
  loading: boolean;
  hasAdminConfig: boolean;
  config: Config;
  customQueries: Query[];
}

const initialState: ConfigState = {
  loading: true,
  hasAdminConfig: false,
  config: { ...configTemplate },
  customQueries: [],
};

export const configReducer = (
  state: ConfigState = initialState,
  action: Action
): ConfigState => {
  switch (action.type) {
    case ActionType.getConfig:
      // The public config only has a subset of keys. Admin-only keys must stay
      // absent (not template defaults) until the admin config arrives, because
      // settings forms submit the whole config object and would overwrite them.
      return {
        ...state,
        loading: false,
        config: {
          ...(state.hasAdminConfig ? state.config : {}),
          ...action.payload,
        } as Config,
      };

    case ActionType.getAdminConfig:
      return {
        ...state,
        hasAdminConfig: true,
        config: { ...state.config, ...action.payload },
      };

    case ActionType.updateConfig:
      return {
        ...state,
        hasAdminConfig: true,
        config: action.payload,
      };

    case ActionType.logout:
    case ActionType.authError:
      return {
        ...state,
        hasAdminConfig: false,
      };

    case ActionType.fetchQueries:
      return {
        ...state,
        customQueries: action.payload,
      };

    case ActionType.addQuery:
      return {
        ...state,
        customQueries: [...state.customQueries, action.payload],
      };

    case ActionType.deleteQuery:
      return {
        ...state,
        customQueries: action.payload,
      };

    case ActionType.updateQuery:
      return {
        ...state,
        customQueries: action.payload,
      };

    default:
      return state;
  }
};
