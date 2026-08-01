#!/usr/bin/env python3
import sys
import subprocess
import json
import argparse

# Reconfigure stdout/stderr to use UTF-8 if possible
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def run_one_command(cmd_args):
    """Runs a 'one' command with --agent option and returns parsed JSON."""
    full_cmd = ["one"] + cmd_args + ["--agent"]
    try:
        # We run with shell=True on Windows because one might be a cmd/powershell script (npm global bin)
        res = subprocess.run(full_cmd, capture_output=True, text=True, shell=True, encoding='utf-8')
        if res.returncode != 0:
            # Check if stderr contains JSON or plain text
            return {"error": res.stderr.strip() or res.stdout.strip() or f"CLI returned code {res.returncode}"}
        
        # If output is empty, return empty dict
        out = res.stdout.strip()
        if not out:
            return {}
        
        # Sometimes there's warning text before the JSON, let's find the first '{'
        start_idx = out.find('{')
        if start_idx != -1:
            out = out[start_idx:]
        
        return json.loads(out)
    except Exception as e:
        return {"error": str(e)}

def get_connection_key():
    data = run_one_command(["list"])
    if "error" in data:
        return None, None, data["error"]
    connections = data.get("connections", [])
    
    # Try Groq (free alternative) first
    for conn in connections:
        if conn.get("platform") == "groq" and conn.get("state") == "operational":
            return "groq", conn.get("key"), None
            
    # Fallback to DeepSeek
    for conn in connections:
        if conn.get("platform") == "deep-seek" and conn.get("state") == "operational":
            return "deep-seek", conn.get("key"), None
            
    return None, None, "No operational groq or deep-seek connection found. Run 'one add groq' or 'one add deep-seek'."

def get_action_id(platform, action_title_query):
    data = run_one_command(["actions", "search", platform, action_title_query])
    if "error" in data:
        return None, data["error"]
    actions = data.get("actions", [])
    for act in actions:
        if action_title_query.lower() in act.get("title", "").lower():
            return act.get("actionId"), None
    if actions:
        return actions[0].get("actionId"), None
    return None, f"Action matching '{action_title_query}' not found."

def check_balance(platform, connection_key):
    if platform != "deep-seek":
        print(f"\nBalance check is not required or supported for '{platform}' (it is free to use!).")
        return
        
    action_id, err = get_action_id(platform, "Get User Balance")
    if err:
        print(f"\n[Error] Finding balance action: {err}")
        return
    
    print("\nFetching DeepSeek balance...")
    res = run_one_command(["actions", "execute", platform, action_id, connection_key])
    if "error" in res:
        print(f"[Error] CLI: {res['error']}")
        return
    
    # Unwrap "response" key if nested
    balance_data = res.get("response", res) if isinstance(res, dict) else res
    
    if isinstance(balance_data, dict) and "balance_infos" in balance_data:
        print("\nDeepSeek Balance Details:")
        for info in balance_data["balance_infos"]:
            currency = info.get("currency", "N/A")
            total = info.get("total_balance", "0.00")
            granted = info.get("granted_balance", "0.00")
            topped_up = info.get("topped_up_balance", "0.00")
            print(f"  * Currency: {currency}")
            print(f"  * Total Balance: {total} {currency}")
            print(f"  * Granted Balance: {granted} {currency}")
            print(f"  * Topped-up Balance: {topped_up} {currency}")
        print()
    else:
        print(f"\nResponse details: {json.dumps(res, indent=2)}")

def trim_history(messages, max_chars=4800):
    """Trims message history to prevent hitting Windows command line length limit (8191 chars)."""
    if not messages:
        return messages
        
    system_msg = None
    if messages[0].get("role") == "system":
        system_msg = messages[0]
        chat_msgs = messages[1:]
    else:
        chat_msgs = messages
        
    # Keep removing oldest messages until the JSON payload fits within character limits
    while chat_msgs:
        temp_payload = {"model": "dummy", "messages": ([system_msg] if system_msg else []) + chat_msgs}
        json_len = len(json.dumps(temp_payload))
        if json_len <= max_chars:
            break
        # Prune the oldest chat message
        chat_msgs = chat_msgs[1:]
        
    return ([system_msg] if system_msg else []) + chat_msgs

def query_chat(platform, connection_key, messages, model):
    action_id, err = get_action_id(platform, "Create Chat Completion")
    if err:
        return None, f"Error finding chat completion action: {err}"
    
    payload = {
        "model": model,
        "messages": messages
    }
    
    # Call one actions execute platform action_id connection_key -d 'payload'
    cmd = [
        "one", "actions", "execute", platform, action_id, connection_key,
        "-d", json.dumps(payload), "--agent"
    ]
    
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, shell=True, encoding='utf-8')
        stdout = res.stdout.strip()
        stderr = res.stderr.strip()
        
        # Locate JSON block
        start_idx = stdout.find('{')
        if start_idx != -1:
            stdout_json_str = stdout[start_idx:]
            try:
                data = json.loads(stdout_json_str)
                
                # Unwrap "response" key if nested
                resp_data = data.get("response", data) if isinstance(data, dict) else data
                
                if isinstance(resp_data, dict):
                    # Check for API-level errors
                    if "error" in resp_data:
                        err_msg = resp_data["error"].get("message", "Unknown API error")
                        return None, err_msg
                    
                    # Check choices
                    choices = resp_data.get("choices", [])
                    if choices:
                        msg = choices[0].get("message", {})
                        content = msg.get("content")
                        reasoning = msg.get("reasoning_content")
                        return {"content": content, "reasoning_content": reasoning}, None
                
                # Check for standard one CLI error wrapped response
                if isinstance(data, dict) and "message" in data and "details" in data:
                    return None, f"{data['message']} - {data['details']}"
                
                return None, f"Unexpected response format: {stdout_json_str}"
            except Exception:
                pass
        
        if "Insufficient Balance" in stdout or "Insufficient Balance" in stderr:
            return None, "Insufficient Balance. Please top up your DeepSeek account balance."
        
        if res.returncode != 0:
            # Check for Windows command line limit errors specifically
            if "too long" in stderr.lower() or "too long" in stdout.lower() or res.returncode == 111:
                return None, "Command line arguments too long. The conversation history was too large for Windows limits."
            return None, stderr or stdout or f"Command failed with exit code {res.returncode}"
            
        return None, stdout or "Empty response"
    except Exception as e:
        return None, str(e)

def main():
    parser = argparse.ArgumentParser(description="Query AI models using the One CLI")
    parser.add_argument("prompt", nargs="?", help="Prompt to send to the model (triggers single query mode)")
    parser.add_argument("--model", help="Model ID to use (defaults depend on platform)")
    parser.add_argument("--reasoner", action="store_true", help="Use reasoning-based models (Qwen-27B on Groq, DeepSeek R1 on DeepSeek)")
    parser.add_argument("--balance", action="store_true", help="Check user account balance (DeepSeek only)")
    
    args = parser.parse_args()
    
    # Resolve connection key
    platform, conn_key, err = get_connection_key()
    if err:
        print(f"[Error] {err}")
        sys.exit(1)
        
    if args.balance:
        check_balance(platform, conn_key)
        sys.exit(0)
        
    # Determine the model based on platform and flags
    if args.model:
        model = args.model
    else:
        if platform == "groq":
            model = "qwen/qwen3.6-27b" if args.reasoner else "llama-3.3-70b-versatile"
        else:
            model = "deepseek-reasoner" if args.reasoner else "deepseek-chat"
            
    if args.prompt:
        # Single query mode
        print(f"\nSending query to {platform} ({model})...")
        messages = [{"role": "user", "content": args.prompt}]
        res, err = query_chat(platform, conn_key, messages, model)
        if err:
            print(f"\n[Error] {err}")
            if "Insufficient Balance" in err:
                print("Tip: You can check your balance using: py query_deepseek.py --balance")
            sys.exit(1)
        
        if res.get("reasoning_content"):
            print("\nThinking Process:")
            print(res["reasoning_content"])
            print("-" * 40)
            
        print("\nResponse:")
        print(res["content"])
        print()
    else:
        # Interactive mode
        print("====================================================")
        print(f"Welcome to Interactive Chat via One CLI ({platform})")
        print(f"Using Model: {model}")
        print("Type 'exit' or 'quit' to end the chat.")
        print("Type 'clear' to reset conversation history.")
        if platform == "deep-seek":
            print("Type 'balance' to check your account balance.")
        print("====================================================")
        
        history = []
        
        while True:
            try:
                user_input = input("\nYou: ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nGoodbye!")
                break
                
            if not user_input:
                continue
                
            if user_input.lower() in ["exit", "quit"]:
                print("Goodbye!")
                break
                
            if user_input.lower() == "clear":
                history = []
                print("Conversation history cleared!")
                continue
                
            if user_input.lower() == "balance" and platform == "deep-seek":
                check_balance(platform, conn_key)
                continue
                
            history.append({"role": "user", "content": user_input})
            
            # Trim history to prevent command-line limit crashes
            history = trim_history(history, max_chars=4800)
            
            print(f"Thinking ({model})...", end="", flush=True)
            res, err = query_chat(platform, conn_key, history, model)
            # clear the "thinking..." line
            print("\r" + " " * 40 + "\r", end="", flush=True)
            
            if err:
                print(f"[Error] {err}")
                # Remove the failed prompt from history so we don't repeat the error
                history.pop()
                continue
            
            # Print reasoning (if it's a reasoning model and contains thinking output)
            if res.get("reasoning_content"):
                print("[Thinking Process]")
                print(res["reasoning_content"])
                print("-" * 30)
            elif "<think>" in res["content"] and "</think>" in res["content"]:
                # If reasoning is inline in the response content (like Qwen on some systems)
                parts = res["content"].split("</think>")
                think_block = parts[0].replace("<think>", "").strip()
                main_response = parts[1].strip()
                print("[Thinking Process]")
                print(think_block)
                print("-" * 30)
                print(main_response)
                history.append({"role": "assistant", "content": res["content"]})
                continue
                
            print(res["content"])
            history.append({"role": "assistant", "content": res["content"]})

if __name__ == "__main__":
    main()
