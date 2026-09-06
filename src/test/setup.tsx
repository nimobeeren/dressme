import { afterEach } from "vitest";
import { actionSpies } from "./actions-mock";
import { mockRouter, redirect, resetPathname } from "./mocks/next-navigation";

afterEach(() => {
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.back.mockClear();
  mockRouter.forward.mockClear();
  mockRouter.refresh.mockClear();
  mockRouter.prefetch.mockClear();
  redirect.mockClear();
  resetPathname();
  Object.values(actionSpies).forEach((spy) => spy.mockClear());
});
