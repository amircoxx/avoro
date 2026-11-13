/** Provides framework-neutral router aliases used by screens that should not depend on router internals. */
import {
  useLocation,
  useNavigate,
  useParams as useReactRouterParams,
  useSearchParams as useReactRouterSearchParams
} from "react-router-dom";

export function useRouter() {
  return { push: useNavigate() };
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  return useReactRouterSearchParams()[0];
}

export const useParams = useReactRouterParams;
