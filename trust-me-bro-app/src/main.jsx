import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PhoneClient from './PhoneClient.jsx'

// Check if this is a phone client or main screen
const params = new URLSearchParams(window.location.search);
const isPhoneClient = params.has('player');
const Component = isPhoneClient ? <PhoneClient /> : <App />;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {Component}
  </StrictMode>,
)

