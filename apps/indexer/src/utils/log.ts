import fs from "fs";

export const logToFile = (message: string) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;
  fs.appendFileSync("log.txt", logMessage + "\n");
};
