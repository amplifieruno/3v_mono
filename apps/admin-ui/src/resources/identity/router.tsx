import { FC } from 'react';
import { ListPage } from './pages/list';
import { EditPage } from './pages/edit';
// import { PaymentTariffCreatePage } from './pages/create';
import { Route, Routes } from 'react-router';

export const IdentityRouter: FC = () => {
  return (
    <Routes>
      <Route index element={<ListPage />} />
      <Route path='edit/:id' element={<EditPage />} />
      {/* <Route path='create' element={<PaymentTariffCreatePage />} /> */}
    </Routes>
  );
};
