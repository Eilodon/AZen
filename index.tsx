
import React from 'react';
import ReactDOM from 'react-dom/client';
// Point to the correct App version in src/
import App from './src/App';
// Import from the migrated src location
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { EngineProvider } from './src/engine/EngineProvider';
import { KernelProvider } from './src/kernel/KernelProvider';
import './src/index.css'; 

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <KernelProvider>
        <EngineProvider>
          <App />
        </EngineProvider>
      </KernelProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
