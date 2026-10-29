import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { store } from '../../../store/store';
import { App, Category } from '../../../interfaces';
import { AppCard } from './AppCard';

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (name: string, fields: Partial<App>): App => ({
  ...model,
  id: name.length,
  name,
  url: `http://${name.toLowerCase()}.lan:8080`,
  categoryId: 1,
  icon: '',
  isPublic: true,
  description: '',
  orderId: 1,
  isPinned: true,
  ...fields,
});

const renderCard = (apps: App[]) => {
  const category: Category = {
    ...model,
    id: 1,
    name: 'Media',
    type: 'apps',
    isPublic: true,
    isPinned: true,
    orderId: 1,
    apps,
    bookmarks: [],
  };

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AppCard category={category} fromHomepage />
      </MemoryRouter>
    </Provider>
  );
};

const link = (name: string) => screen.getByText(name).closest('a')!;

describe('AppCard URLs', () => {
  it('shows and opens the URL picked for each app', () => {
    renderCard([
      app('Legacy', {}),
      app('Inside', { externalUrl: 'https://inside.example.com' }),
      app('Outside', {
        externalUrl: 'https://outside.example.com',
        preferredUrl: 'external',
      }),
    ]);

    expect(link('Legacy').getAttribute('href')).toBe('http://legacy.lan:8080');
    expect(link('Inside').getAttribute('href')).toBe('http://inside.lan:8080');
    expect(link('Outside').getAttribute('href')).toBe(
      'https://outside.example.com'
    );
    expect(screen.getByText('outside.example.com')).toBeInTheDocument();
  });

  it('opens the internal URL when the external one is picked but empty', () => {
    renderCard([app('Empty', { externalUrl: '', preferredUrl: 'external' })]);

    expect(link('Empty').getAttribute('href')).toBe('http://empty.lan:8080');
    expect(screen.getByText('empty.lan:8080')).toBeInTheDocument();
  });
});
