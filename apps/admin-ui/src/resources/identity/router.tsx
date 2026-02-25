import { FC } from 'react';
import { ListPage } from './pages/list';
import { EditPage } from './pages/edit';
import { ShowPage } from './pages/show';
import { Route, Routes } from 'react-router';

export const IdentityRouter: FC = () => {
  return (
    <Routes>
      <Route index element={<ListPage />} />
      <Route path='edit/:id' element={<EditPage />} />
      <Route path='show/:id' element={<ShowPage />} />
    </Routes>
  );
};
