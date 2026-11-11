import { describe, expect, it } from "vitest";
import { OWNER_EMAIL, OWNER_PASSWORD_MIN_LENGTH } from "./owner-signin";

describe("owner sign-in", () => {
  it("only targets the existing owner's account", () => {
    expect(OWNER_EMAIL).toBe("mirzawebsolution@gmail.com");
  });
  it("allows six-character owner passwords", () => {
    expect(OWNER_PASSWORD_MIN_LENGTH).toBe(6);
  });
});