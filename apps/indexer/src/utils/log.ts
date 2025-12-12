import fs from "fs";

// Utility to log to a file when debugging ponder
export const logToFile = (message: string) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;
  fs.appendFileSync("log.txt", logMessage + "\n");
};
