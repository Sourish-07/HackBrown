import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Landing from './Landing.jsx';
import App from './App.jsx';           // admin / display
import PhoneClient from './PhoneClient.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/admin" element={<App />} />
        <Route path="/player" element={<PhoneClient />} />
        {/* Optional: deep link with pin already filled */}
        <Route path="/player/:pin" element={<PhoneClient />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);