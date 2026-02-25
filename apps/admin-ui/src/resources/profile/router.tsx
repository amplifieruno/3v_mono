import { FC } from 'react';
import { ListPage } from './pages/list';
import { EditPage } from './pages/edit';
import { CreatePage } from './pages/create';
import { ShowPage } from './pages/show';
import { Route, Routes } from 'react-router';

export const ProfileRouter: FC = () => {
  return (
    <Routes>
      <Route index element={<ListPage />} />
      <Route path='edit/:id' element={<EditPage />} />
      <Route path='create' element={<CreatePage />} />
      <Route path='show/:id' element={<ShowPage />} />
    </Routes>
  );
};
