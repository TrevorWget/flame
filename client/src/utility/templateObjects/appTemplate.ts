import { App, NewApp } from '../../interfaces';

export const newAppTemplate: NewApp = {
  name: '',
  url: '',
  externalUrl: '',
  preferredUrl: 'internal',
  icon: '',
  iconOnDark: null,
  iconOnLight: null,
  categoryId: -1,
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: '',
};

export const appTemplate: App = {
  ...newAppTemplate,
  isPinned: false,
  orderId: 0,
  id: -1,
  createdAt: new Date(),
  updatedAt: new Date(),
};
