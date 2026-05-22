export interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
  strict?: boolean;
}

export const COMPUTER_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'get_current_datetime',
    description: 'Returns the current date and time.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['full', 'date_only', 'time_only', 'year_only'],
          description: "Format of the datetime information. Default is 'full'.",
        },
      },
      required: ['format'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'open_path',
    description: "Opens a file, folder, application, or URL on the user's computer.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'The path or URL to open.',
        },
      },
      required: ['target'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'open_application',
    description: 'Launches an installed desktop application by name.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        appName: {
          type: 'string',
          description: 'The visible application name, for example "Safari" or "Notes".',
        },
      },
      required: ['appName'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'activate_application',
    description: 'Brings an already-open application to the foreground.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        appName: {
          type: 'string',
          description: 'The visible application name to focus.',
        },
      },
      required: ['appName'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_applications',
    description: 'Lists common desktop applications installed on this computer.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'manage_clipboard',
    description: 'Reads from or writes to the system clipboard.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write'],
          description: 'The clipboard action to perform.',
        },
        content: {
          type: 'string',
          description: 'The text to write to the clipboard. Use an empty string when reading.',
        },
      },
      required: ['action', 'content'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'execute_command',
    description: "Executes a shell command on the user's computer.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'take_screenshot',
    description: "Takes a screenshot of the user's primary screen.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_screen_state',
    description: 'Returns connected display metadata and preview thumbnails for the current desktop.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'mouse_click',
    description: 'Clicks at an absolute screen coordinate on the desktop.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Horizontal screen coordinate in pixels.' },
        y: { type: 'number', description: 'Vertical screen coordinate in pixels.' },
        button: {
          type: 'string',
          enum: ['left', 'right'],
          description: 'Mouse button to use.',
        },
        clickCount: {
          type: 'number',
          description: 'Number of clicks to perform.',
        },
      },
      required: ['x', 'y', 'button', 'clickCount'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'type_text',
    description: 'Types literal text into the active desktop application.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The exact text to type.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'press_key',
    description: 'Presses a keyboard key or key chord in the active desktop application.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'A key name such as return, tab, escape, up, down, left, right, cmd+c, or ctrl+l.',
        },
      },
      required: ['key'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_schedule',
    description: 'Fetches the user schedule or calendar events.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'The date to fetch the schedule for (ISO format or "today").',
        },
      },
      required: ['date'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_clock',
    description: 'Returns the current time and active alarms.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_directory',
    description: 'Lists files and folders in a specified directory.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path to list.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
];

export async function handleToolCall(name: string, args: any): Promise<any> {
  const electronAPI = (window as any).electronAPI;
  if (!electronAPI) {
    throw new Error('Electron API not available');
  }

  switch (name) {
    case 'get_current_datetime': {
      const now = new Date();
      if (args.format === 'date_only') return now.toLocaleDateString();
      if (args.format === 'time_only') return now.toLocaleTimeString();
      if (args.format === 'year_only') return now.getFullYear().toString();
      return now.toLocaleString();
    }

    case 'open_path':
      return electronAPI.openPath(args.target);

    case 'open_application':
      return electronAPI.openApplication(args.appName);

    case 'activate_application':
      return electronAPI.activateApplication(args.appName);

    case 'list_applications':
      return electronAPI.listApplications();

    case 'manage_clipboard':
      if (args.action === 'read') {
        return electronAPI.readClipboard();
      }
      return electronAPI.writeClipboard(args.content);

    case 'execute_command':
      return electronAPI.executeCommand(args.command);

    case 'take_screenshot':
      return electronAPI.takeScreenshot();

    case 'get_screen_state':
      return electronAPI.getScreenState().then((state: any) => ({
        success: !!state?.displays,
        displays: state?.displays || [],
        previewCount: state?.previews?.length || 0,
      }));

    case 'mouse_click':
      return electronAPI.mouseClick(args);

    case 'type_text':
      return electronAPI.typeText(args.text);

    case 'press_key':
      return electronAPI.pressKey(args.key);

    case 'get_schedule':
      return `Schedule for ${args.date}: 10:00 AM Standup Meeting, 2:00 PM Project Review.`;

    case 'get_clock':
      return {
        currentTime: new Date().toLocaleTimeString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        alarms: [],
      };

    case 'list_directory':
      return electronAPI.listDirectory(args.path);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
