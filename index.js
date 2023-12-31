#!/usr/bin/env node
import { Configuration, OpenAIApi } from "openai";
import { promisify } from 'util';
import path from "path";
import process from "process";
import { exec as originalExec, execSync } from 'child_process';
import prompts from "prompts";
import { program } from "commander";

let openai;

export async function getGitSummary() {
  try {
    const dotenv = await import("dotenv");
    const envPath = path.join(process.cwd(), '.env');
    dotenv.config({ path: envPath });
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY
    });
    openai = new OpenAIApi(configuration);
    
    const exec = promisify(originalExec);
    const { stdout } = await exec("git diff --cached -- . ':(exclude)*lock.json' ':(exclude)*lock.yaml'");
    const summary = stdout.trim();
    if (summary.length === 0) {
      return null;
    }
    
    return summary;
    
  } catch (error) {
    console.error("Error while summarizing Git changes:", error);
    process.exit(1);
  }
}

const gptCommit = async () => {
  const gitSummary = await getGitSummary();
  if (!gitSummary) {
    console.log('No changes to commit. Commit canceled.');
    process.exit(0);
  }
  const prompt = `Generate a Git commit message based on the following summary: ${gitSummary}
  \n\nThe Commit message must wrap with double quote like this "your commit message"
  \n\nCommit message: `; 
  const parameters = {
    model: "gpt-3.5-turbo-instruct",
    prompt,
    temperature: 0,
    max_tokens: 50,
    n: 1,
    stop: null,
  };
  
  const response = await openai.createCompletion(parameters);
  
  const message = response.data.choices[0].text.trim();
  
  const confirm = await prompts({
    type: "confirm",
    name: "value",
    message: `${message}.`,
    initial: true,
  });
  
  if (confirm.value) {
    execSync(`git commit -m ${message}`);
    console.log("Committed with the suggested message.");
  } else {
    console.log("Commit canceled.");
  }
};
const gitExtension = (args) => {
  // Extract the command and arguments from the command line
  const [command, ...rest] = args;

  program
    .command("commit")
    .description("Generate a Git commit message based on the summary of changes")
    .action(async () => {
      await gptCommit();
    });

    // Add more commands here

  // Handle invalid commands
  program.on("command:*", () => {
    console.error("Invalid command: %s\n", program.args.join(" "));
    program.help();
    process.exit(1);
  });
  program.parse(process.argv);
};

gitExtension(process.argv.slice(2));

export default gitExtension;
