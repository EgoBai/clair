import React from 'react';
import AppLayout from './components/Layout/AppLayout';
import { AppRoutes } from './routes';
import './App.css';

const App: React.FC = () => {
  return (
    <AppLayout>
      <AppRoutes />
    </AppLayout>
  );
};

export default App;
