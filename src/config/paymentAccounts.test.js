import { describe, expect, it } from "vitest";
import { DEFAULT_PAYMENT_ACCOUNTS, getPaymentAccounts, getPaymentMethodDetails } from "./paymentAccounts";

describe("paymentAccounts config", () => {
  it("provides default payment accounts with valid structures", () => {
    expect(DEFAULT_PAYMENT_ACCOUNTS.bank.iban).toBe("PK72MEZN0002010108927451");
    expect(DEFAULT_PAYMENT_ACCOUNTS.bank.accountTitle).toBe("FikarNot Official");
    expect(DEFAULT_PAYMENT_ACCOUNTS.jazzcash.number).toBe("03709072688");
    expect(DEFAULT_PAYMENT_ACCOUNTS.easypaisa.number).toBe("03709072688");
  });

  it("merges custom site settings over defaults", () => {
    const customSettings = {
      bankName: "HBL",
      bankAccountNumber: "1234567890",
      bankIban: "PK00HABB00001234567890",
      jazzcashNumber: "03001122334",
    };
    const accounts = getPaymentAccounts(customSettings);
    expect(accounts.bank.name).toBe("HBL");
    expect(accounts.bank.accountNumber).toBe("1234567890");
    expect(accounts.bank.iban).toBe("PK00HABB00001234567890");
    expect(accounts.bank.accountTitle).toBe("FikarNot Official"); // defaulted
    expect(accounts.jazzcash.number).toBe("03001122334");
    expect(accounts.easypaisa.number).toBe("03709072688"); // defaulted
  });

  it("returns method-specific details", () => {
    const bank = getPaymentMethodDetails("bank_transfer");
    expect(bank.key).toBe("bank_transfer");
    expect(bank.label).toBe("Bank Transfer");
    expect(bank.iban).toBe("PK72MEZN0002010108927451");

    const jz = getPaymentMethodDetails("jazzcash");
    expect(jz.key).toBe("jazzcash");
    expect(jz.number).toBe("03709072688");

    const ep = getPaymentMethodDetails("easypaisa");
    expect(ep.key).toBe("easypaisa");
    expect(ep.number).toBe("03709072688");

    expect(getPaymentMethodDetails("cod")).toBeNull();
  });
});
