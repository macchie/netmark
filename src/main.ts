// Import core styles
import './styles.css';

// Import HTMX (for future use or htmx enabled interactions)
import 'htmx.org';

// Import App Logic
import { AppController } from './app';

window.addEventListener("DOMContentLoaded", () => {
    // Initialize the application controller
    // We attach it to the window object so that inline onclick handlers in HTML continue to work
    window.app = new AppController();
    window.app.init();
});
