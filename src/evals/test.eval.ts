import { evalite } from "evalite";

import {
  createMemoryFileSystem,
  runEvalTask,
  type EvalInput,
  type EvalExpected,
  scorers,
} from "./test-helpers";

let order = 1;
function count(name: string) {
  return `${order++}. ${name}`;
}

function repeatData(
  times: number,
  data: {
    input: Omit<EvalInput, "inferenceOptions">;
    expected?: EvalExpected | undefined;
  }[]
): {
  input: EvalInput;
  expected?: EvalExpected | undefined;
}[] {
  const repeated = Array.from({ length: times }, () => data).flat();

  function mulberry32(a: number) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const modified = repeated.map((item, index) => {
    const seed = Math.floor(mulberry32(index)() * Math.pow(10, 16));

    const result = {
      ...item,
      input: {
        ...item.input,
        inferenceOptions: {
          seed,
          // topP: 0.99,
          temperature: 0.1,
        },
      } satisfies EvalInput,
    };
    return result;
  });

  return modified;
}

const DATA_REPEAT_COUNT = 4;

evalite<EvalInput, EvalExpected>(count("Update README.md"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "In README.md, change the title of the markdown file 'Todo app' -> 'Calculator app'. After the title, change the description to 'Calculates stuff.'",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "README.md": `# Todo app\n\nDescription TBD.`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "README.md": `# Calculator app\n\nCalculates stuff.`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Puzzle"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "You are on a quest to solve a puzzle. You have file SECRET.md and file SAVE_ANSWER_HERE.md available. GO!",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "SECRET.md": `The secret number is: 74`,
              "SAVE_ANSWER_HERE.md": `The puzzle is solved by saving the secret number here: `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "SECRET.md": `The secret number is: 74`,
              "SAVE_ANSWER_HERE.md": `The puzzle is solved by saving the secret number here: 74`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Rename Function"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt: "Rename the function 'add' to 'addTwoNumbers' in math.ts.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "math.ts": `
                      function add(a: number, b: number) {
                        return a + b;
                      }
                      console.log(add(1, 2));
                    `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "math.ts": `
                      function addTwoNumbers(a: number, b: number) {
                        return a + b;
                      }
                      console.log(addTwoNumbers(1, 2));
                    `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Update Dependency to Latest Version"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt: `In package.json, update eslint-plugin-react-compiler to the latest version.
ou may need to find out what the latest version is.
Proceed without user input until the full task is completed.
Take one thing at a time and report back.`,
          memoryFileSystem: await createMemoryFileSystem(
            {
              "package.json": `
                {
                    "name": "todo-app",
                    "description": "TODO",
                    "dependencies": {
                        "eslint-plugin-react-compiler": "19.0.0-beta-27714ef-20250124"
                    }
                }
              `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "package.json": `
                {
                    "name": "todo-app",
                    "description": "TODO",
                    "dependencies": {
                        "eslint-plugin-react-compiler": "19.0.0-beta-decd7b8-20250118"
                    }
                }
              `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Rearrange Object Properties"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt: "In config.json, sort properties alphabetically.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "config.json": `
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "username": "admin",
    "password": "secret"
  },
  "server": {
    "port": 8080,
    "ssl": true
  },
  "logging": {
    "level": "debug",
    "file": "app.log"
  }
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "config.json": `
{
  "database": {
    "host": "localhost",
    "password": "secret",
    "port": 5432,
    "username": "admin"
  },
  "logging": {
    "file": "app.log",
    "level": "debug"
  },
  "server": {
    "port": 8080,
    "ssl": true
  }
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Add a New Test File"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Create a new test file tests/calculateSum.test.ts for src/calculateSum.ts and add basic unit tests there. No need to run the tests yet.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/calculateSum.ts": `
export function calculateSum(a: number, b: number): number {
  return a + b;
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/calculateSum.ts": `
export function calculateSum(a: number, b: number): number {
  return a + b;
}
`,
              "tests/calculateSum.test.ts": `
import { calculateSum } from '../src/calculateSum';

describe('calculateSum', () => {
  it('should return the sum of two numbers', () => {
    expect(calculateSum(2, 3)).toBe(5);
    expect(calculateSum(-1, 1)).toBe(0);
  });
});
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Delete Unused Variables"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Remove (by editing) unused variables in utils.ts. Do it by guessing. Don't use the linter. Go wild, there is no risk.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "utils.ts": `
const usedVar = 42;
const unusedVar = 'I am not used';
const anotherUnused = true;

export function calculate() {
  console.log(usedVar);
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "utils.ts": `
const usedVar = 42;

export function calculate() {
  console.log(usedVar);
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Poem"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Create a file called POEM.md. Then edit that file to write a short poem in it.",
          memoryFileSystem: await createMemoryFileSystem(
            {},
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "POEM.md": `Poem goes here.`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(
  count("Refactor Class to Functional Component"),
  {
    data: async () => {
      return repeatData(DATA_REPEAT_COUNT, [
        {
          input: {
            prompt:
              "Convert MyComponent from a class component to a functional component in MyComponent.tsx.",
            memoryFileSystem: await createMemoryFileSystem(
              {
                "MyComponent.tsx": `
import React, { Component } from 'react';

interface MyComponentProps {
  title: string;
}

interface MyComponentState {
  count: number;
}

class MyComponent extends Component<MyComponentProps, MyComponentState> {
  constructor(props: MyComponentProps) {
    super(props);
    this.state = { count: 0 };
  }

  increment = () => {
    this.setState({ count: this.state.count + 1 });
  };

  render() {
    return (
      <div>
        <h1>{this.props.title}</h1>
        <p>Count: {this.state.count}</p>
        <button onClick={this.increment}>Increment</button>
      </div>
    );
  }
}

export default MyComponent;
`,
              },
              {
                addEslintConfig: false,
                formatFiles: true,
              }
            ),
          },
          expected: {
            memoryFileSystem: await createMemoryFileSystem(
              {
                "MyComponent.tsx": `
import React, { useState } from 'react';

interface MyComponentProps {
  title: string;
}

const MyComponent: React.FC<MyComponentProps> = ({ title }) => {
  const [count, setCount] = useState<number>(0);

  const increment = () => {
    setCount(count + 1);
  };

  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count}</p>
      <button onClick={increment}>Increment</button>
    </div>
  );
};

export default MyComponent;
`,
              },
              {
                addEslintConfig: false,
                formatFiles: true,
              }
            ),
          },
        },
      ]);
    },
    task: runEvalTask,
    scorers,
  }
);

evalite<EvalInput, EvalExpected>(count("Add Missing Return Types"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Add explicit return types to all exported functions in api.ts.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "api.ts": `
export function fetchData(url: string) {
  return fetch(url).then(response => response.json());
}

export const calculateSum = (a: number, b: number) => {
  return a + b;
};
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "api.ts": `
export function fetchData(url: string): Promise<any> {
  return fetch(url).then(response => response.json());
}

export const calculateSum = (a: number, b: number): number => {
  return a + b;
};
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Strip Console Logs"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt: "Remove all console.log statements from the src folder.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/file1.ts": `
function greet(name: string) {
  console.log('Hello, ' + name);
  return \`Hello, \${name}\`;
}
`,
              "src/file2.ts": `
console.log('This is a debug message.');

export const add = (a: number, b: number) => {
  return a + b;
};
`,
              "src/subdir/file3.ts": `
export function multiply(a: number, b: number) {
  console.log('Multiplying numbers:', a, b);
  return a * b;
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/file1.ts": `
function greet(name: string) {
  return \`Hello, \${name}\`;
}
`,
              "src/file2.ts": `
export const add = (a: number, b: number) => {
  return a + b;
};
`,
              "src/subdir/file3.ts": `
export function multiply(a: number, b: number) {
  return a * b;
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Rename Variable in Multiple Files"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Rename the variable mainColor to primaryColor in all .ts files under src.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/styles.ts": `
export const mainColor = '#ff5733';

export function getMainColor() {
  return mainColor;
}
`,
              "src/components/Button.tsx": `
import { mainColor } from '../styles';

export const Button = () => {
  return <button style={{ backgroundColor: mainColor }}>Click Me</button>;
};
`,
              "src/utils/colorUtils.ts": `
const mainColor = '#00ff00';

export function lightenMainColor(amount: number) {
  // Implementation
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/styles.ts": `
export const primaryColor = '#ff5733';

export function getPrimaryColor() {
  return primaryColor;
}
`,
              "src/components/Button.tsx": `
import { primaryColor } from '../styles';

export const Button = () => {
  return <button style={{ backgroundColor: primaryColor }}>Click Me</button>;
};
`,
              "src/utils/colorUtils.ts": `
const primaryColor = '#00ff00';

export function lightenPrimaryColor(amount: number) {
  // Implementation
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Add New ESLint Rule"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Add the rule no-explicit-any to the ESLint config and fix all violations.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "eslint.config.js": `export default [
  {
    rules: {
      semi: "error",
      "prefer-const": "error"
    }
  }
];`,
              "src/utils.ts": `
export function processData(data: any) {
  return data.value;
}
`,
              "src/index.ts": `
const result: any = processData({ value: 42 });
console.log(result);
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "eslint.config.js": `export default [
  {
    rules: {
      semi: "error",
      "prefer-const": "error",
      "no-explicit-any": "error"
    }
  }
];`,
              "src/utils.ts": `
export function processData(data: unknown) {
  if (typeof data !== 'object' || data === null || !('value' in data)) {
    throw new Error('Invalid data');
  }
  return (data as { value: number }).value;
}
`,
              "src/index.ts": `
const result: number = processData({ value: 42 });
console.log(result);
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Inject License Header"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Add a license header to the top of every .ts file in the project.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/file1.ts": `
export const greet = (name: string) => {
  return \`Hello, \${name}\`;
};
`,
              "src/file2.ts": `
export const add = (a: number, b: number) => a + b;
`,
              "README.md": `# Project Documentation

Details about the project.
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/file1.ts": `
// Licensed under the MIT License.
// © 2025 Your Company.

export const greet = (name: string) => {
  return \`Hello, \${name}\`;
};
`,
              "src/file2.ts": `
// Licensed under the MIT License.
// © 2025 Your Company.

export const add = (a: number, b: number) => a + b;
`,
              "README.md": `# Project Documentation

Details about the project.
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Update Dependency Versions"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Upgrade all dependencies in package.json to the latest minor version and run any necessary code updates.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "package.json": `
{
  "name": "sample-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "4.17.1",
    "lodash": "4.17.20"
  }
}
`,
              "src/index.ts": `
import express from 'express';
import _ from 'lodash';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send(_.join(['Hello', 'world'], ' '));
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "package.json": `
{
  "name": "sample-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.2",
    "lodash": "^4.17.21"
  }
}
`,
              "src/index.ts": `
import express from 'express';
import _ from 'lodash';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send(_.join(['Hello', 'world'], ' '));
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Split a Monolithic File"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Split bigModule.ts into separate files for each function: doTaskA.ts, doTaskB.ts, utils.ts.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "bigModule.ts": `
export function doTaskA() {
  console.log('Task A');
}

export function doTaskB() {
  console.log('Task B');
}

export function helperUtil() {
  console.log('Utility function');
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "doTaskA.ts": `
export function doTaskA() {
  console.log('Task A');
}
`,
              "doTaskB.ts": `
export function doTaskB() {
  console.log('Task B');
}
`,
              "utils.ts": `
export function helperUtil() {
  console.log('Utility function');
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Swap Out a Library"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Replace all usages of axios with fetch in api.ts and remove axios from package.json.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "package.json": `
{
  "name": "api-client",
  "version": "1.0.0",
  "dependencies": {
    "axios": "^0.21.1"
  }
}
`,
              "api.ts": `
import axios from 'axios';

export async function getUser(id: number) {
  const response = await axios.get(\`https://api.example.com/users/\${id}\`);
  return response.data;
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "package.json": `
{
  "name": "api-client",
  "version": "1.0.0",
  "dependencies": {}
}
`,
              "api.ts": `
export async function getUser(id: number) {
  const response = await fetch(\`https://api.example.com/users/\${id}\`);
  const data = await response.json();
  return data;
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Add JSDoc Comments"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Add JSDoc comments to every exported function in helpers.js, describing parameters and return values.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "helpers.js": `
export function calculateArea(radius) {
  return Math.PI * radius * radius;
}

export const formatDate = (date) => {
  return date.toISOString();
};
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "helpers.js": `
/**
 * Calculates the area of a circle.
 * @param {number} radius - The radius of the circle.
 * @returns {number} The area of the circle.
 */
export function calculateArea(radius) {
  return Math.PI * radius * radius;
}

/**
 * Formats a Date object into ISO string.
 * @param {Date} date - The date to format.
 * @returns {string} The ISO string representation of the date.
 */
export const formatDate = (date) => {
  return date.toISOString();
};
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Introduce Error Handling"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Wrap the logic in fetchData inside a try/catch and log errors.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/fetchData.ts": `
export async function fetchData(url: string) {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/fetchData.ts": `
export async function fetchData(url: string) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Convert JavaScript to TypeScript"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Convert the file legacy.js to TypeScript (legacy.ts) and add type definitions.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "legacy.js": `
function add(a, b) {
  return a + b;
}

function greet(name) {
  return 'Hello, ' + name;
}

module.exports = { add, greet };
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "legacy.ts": `
function add(a: number, b: number): number {
  return a + b;
}

function greet(name: string): string {
  return 'Hello, ' + name;
}

export { add, greet };
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Migrate Functions to a Shared File"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Move all utility functions from index.ts into lib/utils.ts and update imports accordingly.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/index.ts": `
import { helper } from './helper';

export function main() {
  helper();
  utilityFunction();
}

export function utilityFunction() {
  console.log('Utility function');
}
`,
              "src/helper.ts": `
export function helper() {
  console.log('Helper function');
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/index.ts": `
import { helper } from './helper';
import { utilityFunction } from './lib/utils';

export function main() {
  helper();
  utilityFunction();
}
`,
              "src/helper.ts": `
export function helper() {
  console.log('Helper function');
}
`,
              "src/lib/utils.ts": `
export function utilityFunction() {
  console.log('Utility function');
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Enforce Naming Convention"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Enforce snake_case for all environment variables in .env and rename the references in the code.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              ".env": `
API_KEY=12345
databaseURL=http://localhost:5432
useCache=true
`,
              "src/config.ts": `
export const API_KEY = process.env.API_KEY;
export const DATABASE_URL = process.env.databaseURL;
export const USE_CACHE = process.env.useCache === 'true';
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              ".env": `
API_KEY=12345
DATABASE_URL=http://localhost:5432
USE_CACHE=true
`,
              "src/config.ts": `
export const API_KEY = process.env.API_KEY;
export const DATABASE_URL = process.env.DATABASE_URL;
export const USE_CACHE = process.env.USE_CACHE === 'true';
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Add a Default Export"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Change the named export for getData in src/dataFetcher.ts to a default export. Update all imports to match.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/dataFetcher.ts": `
export function getData() {
  return fetch('/data').then(res => res.json());
}
`,
              "src/app.ts": `
import { getData } from './dataFetcher';

getData().then(data => {
  console.log(data);
});
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/dataFetcher.ts": `
export default function getData() {
  return fetch('/data').then(res => res.json());
}
`,
              "src/app.ts": `
import getData from './dataFetcher';

getData().then(data => {
  console.log(data);
});
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Rewrite Conditionals"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Rewrite nested if/else blocks in src/logic.ts into a switch-case statement. By editing the file.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/logic.ts": `
export function handleAction(action: string) {
  if (action === 'start') {
    startProcess();
  } else {
    if (action === 'stop') {
      stopProcess();
    } else {
      console.log('Unknown action');
    }
  }
}

function startProcess() {
  console.log('Process started');
}

function stopProcess() {
  console.log('Process stopped');
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "src/logic.ts": `
export function handleAction(action: string) {
  switch (action) {
    case 'start':
      startProcess();
      break;
    case 'stop':
      stopProcess();
      break;
    default:
      console.log('Unknown action');
  }
}

function startProcess() {
  console.log('Process started');
}

function stopProcess() {
  console.log('Process stopped');
}
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>(count("Batch Rename a Directory"), {
  data: async () => {
    return repeatData(DATA_REPEAT_COUNT, [
      {
        input: {
          prompt:
            "Rename the folder components to ui and update all import paths.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "components/Button.tsx": `
import React from 'react';

export const Button = () => {
  return <button>Click Me</button>;
};
`,
              "components/Header.tsx": `
import React from 'react';
import { Button } from './Button';

export const Header = () => {
  return (
    <header>
      <h1>My App</h1>
      <Button />
    </header>
  );
};
`,
              "src/App.tsx": `
import React from 'react';
import { Header } from '../components/Header';

const App = () => {
  return (
    <div>
      <Header />
    </div>
  );
};

export default App;
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "ui/Button.tsx": `
import React from 'react';

export const Button = () => {
  return <button>Click Me</button>;
};
`,
              "ui/Header.tsx": `
import React from 'react';
import { Button } from './Button';

export const Header = () => {
  return (
    <header>
      <h1>My App</h1>
      <Button />
    </header>
  );
};
`,
              "src/App.tsx": `
import React from 'react';
import { Header } from '../ui/Header';

const App = () => {
  return (
    <div>
      <Header />
    </div>
  );
};

export default App;
`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ]);
  },
  task: runEvalTask,
  scorers,
});
