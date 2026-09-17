import { createBrowserRouter, RouterProvider } from "react-router";
import { DemoPage } from "./routes/demo/DemoPage";

const router = createBrowserRouter([
  { path: "/", element: <DemoPage /> },
  { path: "/demo", element: <DemoPage /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
