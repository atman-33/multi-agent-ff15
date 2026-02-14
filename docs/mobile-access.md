# Mobile Access

Command your AI army from your phone — bed, café, or bathroom.

---

## Requirements (all free)

| Name | In a nutshell | Role |
|------|---------------|------|
| [Tailscale](https://tailscale.com/) | Road to your home from outside | Connect to home PC from café or bathroom |
| SSH | Feet to walk that road | Log into home PC through Tailscale |
| [Termux](https://termux.dev/) | Black screen on phone | Needed to use SSH. Just install on phone |

---

## Setup

### 1. Install Tailscale on both WSL and your phone

Download Tailscale app on your phone from app store.

### 2. On WSL side (Auth key method — no browser needed)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscaled &
sudo tailscale up --authkey tskey-auth-XXXXXXXXXXXX
sudo service ssh start
```

Get your auth key from [Tailscale admin console](https://login.tailscale.com/admin/settings/keys).

### 3. From Termux on your phone

```sh
pkg update && pkg install openssh
ssh youruser@your-tailscale-ip
ffa    # Connect to ff15 session
```

Find your Tailscale IP in the Tailscale app on your phone or run `tailscale ip` on WSL.

---

## Usage

### Disconnect

Just swipe the Termux window closed. tmux sessions survive — AI subordinates keep working silently.

### Voice input

Use your phone's voice keyboard to speak. Noctis understands natural language, so typos from speech recognition don't matter.

### tmux pane switching

`Ctrl+B` then numbers (0-5) to switch panes:
- 0 = Noctis
- 1 = Lunafreya
- 2 = Ignis
- 3 = Gladiolus
- 4 = Prompto
- 5 = Iris

---

## Tips

### Keep SSH connection alive

Add to `~/.ssh/config` on your phone (in Termux):

```
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### Use tmux shortcuts

Learn basic tmux shortcuts for efficient mobile usage:
- `Ctrl+B` then `d` - Detach
- `Ctrl+B` then `[` - Enter scroll mode (use arrow keys, `q` to exit)
- `Ctrl+B` then `z` - Zoom current pane (toggle fullscreen)

### Screen rotation

Lock your phone in landscape mode for better visibility when working with multiple panes.
