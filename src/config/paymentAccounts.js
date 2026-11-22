// Centralized payment account configurations for manual bank and wallet transfers.
// Dynamic values from admin site_settings override these defaults.

export const DEFAULT_PAYMENT_ACCOUNTS = Object.freeze({
  bank: {
    name: "Meezan Bank",
    accountTitle: "FikarNot Official",
    accountNumber: "02010108927451",
    iban: "PK72MEZN0002010108927451",
    instructions: "Transfer from any bank app or ATM. Always enter your Order ID in the transfer remarks/reference.",
  },
  jazzcash: {
    title: "FikarNot Official",
    number: "03709072688",
    instructions: "Send money via JazzCash App or *786#. Enter your Order ID in the reference / message field.",
  },
  easypaisa: {
    title: "FikarNot Official",
    number: "03709072688",
    instructions: "Send money via Easypaisa App or *786#. Enter your Order ID in the reference / message field.",
  },
});

/**
 * Resolves current payment accounts by merging store settings with system defaults.
 * @param {Record<string, any>} siteSettings
 */
export function getPaymentAccounts(siteSettings = {}) {
  const bankName = siteSettings?.bankName || DEFAULT_PAYMENT_ACCOUNTS.bank.name;
  const bankAccountTitle = siteSettings?.bankAccountTitle || DEFAULT_PAYMENT_ACCOUNTS.bank.accountTitle;
  const bankAccountNumber = siteSettings?.bankAccountNumber || DEFAULT_PAYMENT_ACCOUNTS.bank.accountNumber;
  const bankIban = siteSettings?.bankIban || DEFAULT_PAYMENT_ACCOUNTS.bank.iban;
  const bankInstructions = siteSettings?.bankInstructions || DEFAULT_PAYMENT_ACCOUNTS.bank.instructions;

  const jazzcashNumber = siteSettings?.jazzcashNumber || DEFAULT_PAYMENT_ACCOUNTS.jazzcash.number;
  const jazzcashTitle = siteSettings?.jazzcashTitle || bankAccountTitle || DEFAULT_PAYMENT_ACCOUNTS.jazzcash.title;
  const jazzcashInstructions = siteSettings?.jazzcashInstructions || DEFAULT_PAYMENT_ACCOUNTS.jazzcash.instructions;

  const easypaisaNumber = siteSettings?.easypaisaNumber || DEFAULT_PAYMENT_ACCOUNTS.easypaisa.number;
  const easypaisaTitle = siteSettings?.easypaisaTitle || bankAccountTitle || DEFAULT_PAYMENT_ACCOUNTS.easypaisa.title;
  const easypaisaInstructions = siteSettings?.easypaisaInstructions || DEFAULT_PAYMENT_ACCOUNTS.easypaisa.instructions;

  return {
    bank: {
      name: bankName,
      accountTitle: bankAccountTitle,
      accountNumber: bankAccountNumber,
      iban: bankIban,
      instructions: bankInstructions,
    },
    jazzcash: {
      title: jazzcashTitle,
      number: jazzcashNumber,
      instructions: jazzcashInstructions,
    },
    easypaisa: {
      title: easypaisaTitle,
      number: easypaisaNumber,
      instructions: easypaisaInstructions,
    },
  };
}

/**
 * Returns structured details for a specific payment method.
 * @param {string} method - 'bank_transfer' | 'jazzcash' | 'easypaisa'
 * @param {Record<string, any>} siteSettings
 */
export function getPaymentMethodDetails(method, siteSettings = {}) {
  const accounts = getPaymentAccounts(siteSettings);
  if (method === "bank_transfer") return { key: "bank_transfer", label: "Bank Transfer", ...accounts.bank };
  if (method === "jazzcash") return { key: "jazzcash", label: "JazzCash", ...accounts.jazzcash };
  if (method === "easypaisa") return { key: "easypaisa", label: "Easypaisa", ...accounts.easypaisa };
  return null;
}
