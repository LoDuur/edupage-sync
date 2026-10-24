[ -n "${SANDBOX_NPROC:-}" ] && ulimit -u "$SANDBOX_NPROC" 2>/dev/null
ulimit -f 32768 2>/dev/null
ulimit -n 256 2>/dev/null
ulimit -c 0 2>/dev/null
HISTFILE=
PS1='\[\033[38;5;244m\]\w\[\033[0m\] \$ '
PROMPT_COMMAND='printf "\033]7777;prompt;%s\007" "$?"'
alias ls='ls --color=auto'
