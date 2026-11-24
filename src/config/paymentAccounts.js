// Centralized payment account configurations for manual bank and wallet transfers.
// Dynamic values from admin site_settings configure these accounts.
// If admin settings are blank, the payment method is hidden.

export const DEFAULT_PAYMENT_ACCOUNTS = Object.freeze({
  bank: {
    name: "",
    accountTitle: "",
    accountNumber: "",
    iban: "",
    instructions: "Transfer from any bank app or ATM. Always enter your Order ID in the transfer remarks/reference.",
  },
  jazzcash: {
    title: "",
    number: "",
    instructions: "Send money via JazzCash App or *786#. Enter your Order ID in the reference / message field.",
  },
  easypaisa: {
    title: "",
    number: "",
    instructions: "Send money via Easypaisa App or *786#. Enter your Order ID in the reference / message field.",
  },
});

export const DEFAULT_PAYMENT_FORM_FIELDS = Object.freeze({
  jazzcashNumber: "",
  jazzcashTitle: "",
  easypaisaNumber: "",
  easypaisaTitle: "",
  bankName: "",
  bankAccountTitle: "",
  bankAccountNumber: "",
  bankIban: "",
  bankInstructions: "Transfer from any bank app or ATM. Always enter your Order ID in the transfer remarks/reference.",
});

/**
 * Resolves current payment accounts from store settings.
 * If numbers/accounts are not configured, they remain empty string so they are not shown.
 * @param {Record<string, any>} siteSettings
 */
export function getPaymentAccounts(siteSettings = {}) {
  const bankName = siteSettings?.bankName || "";
  const bankAccountTitle = siteSettings?.bankAccountTitle || "";
  const bankAccountNumber = siteSettings?.bankAccountNumber || "";
  const bankIban = siteSettings?.bankIban || "";
  const bankInstructions = siteSettings?.bankInstructions || DEFAULT_PAYMENT_ACCOUNTS.bank.instructions;

  const jazzcashNumber = siteSettings?.jazzcashNumber || "";
  const jazzcashTitle = siteSettings?.jazzcashTitle || bankAccountTitle || "";
  const jazzcashInstructions = siteSettings?.jazzcashInstructions || DEFAULT_PAYMENT_ACCOUNTS.jazzcash.instructions;

  const easypaisaNumber = siteSettings?.easypaisaNumber || "";
  const easypaisaTitle = siteSettings?.easypaisaTitle || bankAccountTitle || "";
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
    jazzcashNumber,
    jazzcashTitle,
    easypaisaNumber,
    easypaisaTitle,
    bankName,
    bankAccountTitle,
    bankAccountNumber,
    bankIban,
    bankInstructions,
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
