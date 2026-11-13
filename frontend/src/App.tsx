/** Creates the browser router and mounts the shared application shell around page routes. */
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import BeautyShell from "./components/layout/beauty-shell";
import { AppRoutes } from "./routes/app-routes";

export function App() {
  const router = createBrowserRouter([
    { path: "*", element: <BeautyShell><AppRoutes /></BeautyShell> }
  ]);
  return <RouterProvider router={router} />;
}
