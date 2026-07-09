import crypto from "crypto";

const AI_ID_SEQUENCE_NAME = "users_ai_id_seq";
const AI_ID_SEQUENCE_LIMIT = 999999;

const sixDigit = (value) => String(value).padStart(6, "0");

const numericEmailSuffix = (email) => {
  const normalized = String(email || "").trim().toLowerCase();
  const digest = crypto.createHash("sha256").update(normalized).digest();
  return sixDigit(digest.readUInt32BE(0) % 1000000);
};

const contactSuffix = ({ email, phoneNumber }) => {
  const normalizedPhoneNumber = String(phoneNumber || "").replace(/\D/g, "");
  if (normalizedPhoneNumber) {
    return normalizedPhoneNumber.slice(-6).padStart(6, "0");
  }
  return numericEmailSuffix(email);
};

export function formatAiId(sequenceValue, { email, phoneNumber }) {
  if (!Number.isInteger(sequenceValue) || sequenceValue < 1 || sequenceValue > AI_ID_SEQUENCE_LIMIT) {
    throw new Error("AI ID sequence is exhausted");
  }
  return `${sixDigit(sequenceValue)}${contactSuffix({ email, phoneNumber })}`;
}

export async function createAiId(connection, { email, phoneNumber }) {
  const [rows] = await connection.execute(`SELECT nextval('${AI_ID_SEQUENCE_NAME}') AS value`);
  const sequenceValue = Number(rows[0]?.value);
  return formatAiId(sequenceValue, { email, phoneNumber });
}
