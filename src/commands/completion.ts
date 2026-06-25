// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0
 
/**
 * Completion command - Generate shell completion scripts
 */

import { Command } from 'commander';

export function completionCommand(): Command {
  const cmd = new Command('completion');

  cmd
    .description('Generate shell completion script')
    .argument('[shell]', 'Shell type: bash, zsh, or fish (auto-detected if not specified)')
    .action((shell?: string) => {
      const detectedShell = shell || detectShell();
      
      if (!detectedShell) {
        console.error('Could not detect shell. Please specify: bash, zsh, or fish');
        console.error('Example: mcpmock completion bash >> ~/.bashrc');
        process.exit(1);
      }

      const script = generateCompletionScript(detectedShell);
      console.log(script);
      
      if (!shell) {
        // Show installation instructions
        console.error('');
        console.error(`# To enable completion, add this to your shell config:`);
        if (detectedShell === 'bash') {
          console.error(`# echo 'eval "$(mcpmock completion bash)"' >> ~/.bashrc`);
          console.error(`#`);
          console.error(`# Then reload your shell:`);
          console.error(`# source ~/.bashrc`);
          console.error(`# (or start a new terminal)`);
        } else if (detectedShell === 'zsh') {
          console.error(`# echo 'eval "$(mcpmock completion zsh)"' >> ~/.zshrc`);
          console.error(`#`);
          console.error(`# Then reload your shell:`);
          console.error(`# source ~/.zshrc`);
          console.error(`# (or start a new terminal)`);
        } else if (detectedShell === 'fish') {
          console.error(`# mcpmock completion fish > ~/.config/fish/completions/mcpmock.fish`);
          console.error(`#`);
          console.error(`# Fish will auto-load completions in new sessions`);
        }
      }
    });

  return cmd;
}

/**
 * Detect current shell
 */
function detectShell(): string | null {
  const shell = process.env.SHELL || '';
  
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  
  return null;
}

/**
 * Generate completion script for the specified shell
 */
function generateCompletionScript(shell: string): string {
  if (shell === 'bash') {
    return `# mcpmock completion for bash
_mcpmock_completion() {
    local cur prev words cword
    _init_completion || return

    # Commands
    local commands="run record import build completion agents"
    
    # If no command yet, complete commands
    if [[ \${cword} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
        return
    fi

    local cmd=\${words[1]}
    
    # Only complete options if current word starts with -
    if [[ "\${cur}" == --* ]]; then
        # User typed --, show long options
        case "\${cmd}" in
            run)
                local opts="--data --port --replay --similarity-threshold --example-similarity --page-size --verbose --debug --help"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            record)
                local opts="--mcpdesc --output --upstream --port --path --verbose --help"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            import)
                local opts="--input --output --verbose --help"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            build)
                local opts="--mcpdesc --output --no-ai --verbose --help"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            completion)
                # No long options for completion
                ;;
            agents)
                local opts="--command --workflows --all"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
        esac
    elif [[ "\${cur}" == -* ]]; then
        # User typed -, show short options
        case "\${cmd}" in
            run)
                local opts="-h"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            record)
                local opts="-h"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            import)
                local opts="-h"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            build)
                local opts="-h"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            completion)
                local opts="-h"
                COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                ;;
            agents)
                # No short options
                ;;
        esac
    else
        # No dash prefix, complete specific cases
        case "\${cmd}" in
            agents)
                # Complete command names for --command option
                if [[ "\${prev}" == "--command" ]]; then
                    local subcommands="run record import build completion"
                    COMPREPLY=( $(compgen -W "\${subcommands}" -- "\${cur}") )
                else
                    # No further completion needed
                    COMPREPLY=()
                fi
                ;;
            *)
                # Use standard completion (files/directories)
                compopt -o default
                COMPREPLY=()
                ;;
        esac
    fi
}

complete -F _mcpmock_completion mcpmock
`;
  } else if (shell === 'zsh') {
    return `# mcpmock completion for zsh
#compdef mcpmock

_mcpmock() {
    local -a commands
    commands=(
        'run:Start mock MCP server from mcpdesc file'
        'record:Record traffic from live MCP server'
        'import:Import mcptest execution log to JSONL'
        'build:Build mock data files with AI assistance'
        'completion:Generate shell completion script'
        'agents:Agent-optimized help (for Copilot, Claude, etc.)'
    )

    local curcontext="\$curcontext" state line
    typeset -A opt_args

    _arguments -C \\
        '1: :->command' \\
        '*:: :->args'

    case \$state in
        command)
            _describe 'command' commands
            ;;
        args)
            case \$line[1] in
                run)
                    _arguments \\
                        '1:dump file:_files' \\
                        '--data[Directory with mock data overrides]:directory:_directories' \\
                        '--port[HTTP port (enables HTTP transport)]:port:' \\
                        '--replay[Replay recorded traffic]:file:_files' \\
                        '--similarity-threshold[Minimum similarity percentage for replay (1-100)]:percent:' \\
                        '--example-similarity[Minimum similarity percentage for examples (1-100)]:percent:' \\
                        '--page-size[Enable pagination with N items per page]:number:' \\
                        '--verbose[Enable verbose logging]' \\
                        '--debug[Enable debug mode]' \\
                        '(-h --help)'{-h,--help}'[Show help]' \\
                        '*:file:_files'
                    ;;
                record)
                    _arguments \\
                        '--mcpdesc[Path to mcpdesc file]:file:_files' \\
                        '--output[Output JSONL file]:file:_files' \\
                        '--upstream[Upstream server URL]:url:' \\
                        '--port[Port for proxy]:port:' \\
                        '--path[Path for proxy endpoint]:path:' \\
                        '--verbose[Enable verbose logging]' \\
                        '(-h --help)'{-h,--help}'[Show help]' \\
                        '*:file:_files'
                    ;;
                import)
                    _arguments \\
                        '--input[Input execution log file]:file:_files' \\
                        '--output[Output JSONL file]:file:_files' \\
                        '--verbose[Enable verbose logging]' \\
                        '(-h --help)'{-h,--help}'[Show help]' \\
                        '*:file:_files'
                    ;;
                build)
                    _arguments \\
                        '--mcpdesc[Path to mcpdesc file]:file:_files' \\
                        '--output[Output directory]:directory:_directories' \\
                        '--no-ai[Disable AI generation (use faker only)]' \\
                        '--verbose[Enable verbose logging]' \\
                        '(-h --help)'{-h,--help}'[Show help]' \\
                        '*:file:_files'
                    ;;
                completion)
                    _arguments \\
                        '1:shell:(bash zsh fish)' \\
                        '(-h --help)'{-h,--help}'[Show help]'
                    ;;
                agents)
                    _arguments \\
                        '--command[Get help for specific command]:command:(run record import build completion)' \\
                        '--workflows[Show all end-to-end workflows]' \\
                        '--all[Output all commands in single document]'
                    ;;
                *)
                    _files
                    ;;
            esac
            ;;
    esac
}

_mcpmock
`;
  } else if (shell === 'fish') {
    return `# mcpmock completion for fish

# Commands
complete -c mcpmock -f -n "__fish_use_subcommand" -a "run" -d "Start mock MCP server from mcpdesc file"
complete -c mcpmock -f -n "__fish_use_subcommand" -a "record" -d "Record traffic from live MCP server"
complete -c mcpmock -f -n "__fish_use_subcommand" -a "import" -d "Import mcptest execution log to JSONL"
complete -c mcpmock -f -n "__fish_use_subcommand" -a "build" -d "Build mock data files with AI assistance"
complete -c mcpmock -f -n "__fish_use_subcommand" -a "completion" -d "Generate shell completion script"
complete -c mcpmock -f -n "__fish_use_subcommand" -a "agents" -d "Agent-optimized help (for Copilot, Claude, etc.)"

# run command options
complete -c mcpmock -n "__fish_seen_subcommand_from run" -l data -d "Directory with mock data overrides" -a "(__fish_complete_directories)"
complete -c mcpmock -n "__fish_seen_subcommand_from run" -l port -d "HTTP port (enables HTTP transport)"
complete -c mcpmock -n "__fish_seen_subcommand_from run" -l replay -d "Replay recorded traffic" -F
complete -c mcpmock -n "__fish_seen_subcommand_from run" -l similarity-threshold -d "Minimum similarity percentage for replay (1-100)"
complete -c mcpmock -n "__fish_seen_subcommand_from run" -l example-similarity -d "Minimum similarity percentage for examples (1-100)"
complete -c mcpmock -n "__fish_seen_subcommand_from run" -l page-size -d "Enable pagination with N items per page"
complete -c mcpmock -n "__fish_seen_subcommand_from run" -l verbose -d "Enable verbose logging"
complete -c mcpmock -n "__fish_seen_subcommand_from run" -l debug -d "Enable debug mode"
complete -c mcpmock -n "__fish_seen_subcommand_from run" -s h -l help -d "Show help"

# record command options
complete -c mcpmock -n "__fish_seen_subcommand_from record" -l mcpdesc -d "Path to mcpdesc file" -F
complete -c mcpmock -n "__fish_seen_subcommand_from record" -l output -d "Output JSONL file" -F
complete -c mcpmock -n "__fish_seen_subcommand_from record" -l upstream -d "Upstream server URL"
complete -c mcpmock -n "__fish_seen_subcommand_from record" -l port -d "Port for proxy"
complete -c mcpmock -n "__fish_seen_subcommand_from record" -l path -d "Path for proxy endpoint"
complete -c mcpmock -n "__fish_seen_subcommand_from record" -l verbose -d "Enable verbose logging"
complete -c mcpmock -n "__fish_seen_subcommand_from record" -s h -l help -d "Show help"

# import command options
complete -c mcpmock -n "__fish_seen_subcommand_from import" -l input -d "Input execution log file" -F
complete -c mcpmock -n "__fish_seen_subcommand_from import" -l output -d "Output JSONL file" -F
complete -c mcpmock -n "__fish_seen_subcommand_from import" -l verbose -d "Enable verbose logging"
complete -c mcpmock -n "__fish_seen_subcommand_from import" -s h -l help -d "Show help"

# build command options
complete -c mcpmock -n "__fish_seen_subcommand_from build" -l mcpdesc -d "Path to mcpdesc file" -F
complete -c mcpmock -n "__fish_seen_subcommand_from build" -l output -d "Output directory" -a "(__fish_complete_directories)"
complete -c mcpmock -n "__fish_seen_subcommand_from build" -l no-ai -d "Disable AI generation (use faker only)"
complete -c mcpmock -n "__fish_seen_subcommand_from build" -l verbose -d "Enable verbose logging"
complete -c mcpmock -n "__fish_seen_subcommand_from build" -s h -l help -d "Show help"

# completion command
complete -c mcpmock -n "__fish_seen_subcommand_from completion" -a "bash zsh fish" -d "Shell type"
complete -c mcpmock -n "__fish_seen_subcommand_from completion" -s h -l help -d "Show help"

# agents command options
complete -c mcpmock -n "__fish_seen_subcommand_from agents" -l command -d "Get help for specific command" -a "run record import build completion"
complete -c mcpmock -n "__fish_seen_subcommand_from agents" -l workflows -d "Show all end-to-end workflows"
complete -c mcpmock -n "__fish_seen_subcommand_from agents" -l all -d "Output all commands in single document"
`;
  }

  return '';
}
