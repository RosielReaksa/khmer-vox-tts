# Step-by-Step Google Stitch Prompts: Khmer Vox TTS

Use these modular prompts one-by-one in **Google Stitch** (stitch.withgoogle.com) to design the entire website. This step-by-step approach avoids tool timeouts and ensures each section receives maximum detail and visual polish.

---

### Step 1: Landing Page Hero & Audio Playground
*Paste this to build the top hero section of the landing page.*

> **Prompt:**
> Design a premium B2B dark-theme Hero Section for "Khmer Vox TTS".
> 
> **Visual Styling:**
> - Background: Deep midnight obsidian (`#0b0f19`).
> - Accent: Glowing emerald green (`#10b981`) for CTAs and highlights.
> - Layout: Modern 12-column grid, responsive, generous negative space.
> - Surface: Semi-transparent glassmorphic cards with thin borders (`border-white/10`) and background blurs.
> 
> **Content Elements:**
> 1. **Header Navigation Menu**: Logo on the left; links for "Features", "Docs", "Pricing"; and a glowing emerald green "Get Started" CTA button on the right.
> 2. **Left Column**: Headline "Khmer AI Voices, Redefined", subtitle "Generate ultra-realistic Khmer speech and clone custom voices with state-of-the-art precision. Built for Cambodian creators, businesses, and developers.", and two CTA buttons: "Try for Free" (filled emerald) and "View API Docs" (outlined).
> 3. **Right Column (Audio Generator Playground Card)**:
>    - A glassmorphic card container.
>    - Textarea containing Khmer placeholder text: "សូមស្វាគមន៍មកកាន់ Khmer Vox TTS។".
>    - Controls: Voice selection dropdown ("Female (Sokha)", "Male (Piseth)") and speed slider.
>    - A glowing green "Generate Speech" CTA.
>    - A visual audio output player showing a glowing green waveform indicator and time duration.

---

### Step 2: Landing Page Features & Developer Code switcher
*Paste this to build the features list and the code playground section.*

> **Prompt:**
> Design a Features & Developer Integration section for "Khmer Vox TTS" matching the obsidian/emerald theme.
> 
> **Structure & Content:**
> 1. **Grid of 3 Cards**:
>    - *Card 1 (Standard TTS)*: Title "Standard Speech", description "Fast, high-fidelity Khmer text-to-speech utilizing preset male and female voices at 1.5 tokens/sec."
>    - *Card 2 (Voice Cloning)*: Title "Custom Voice Cloning", description "Upload a 10-second reference audio to clone any voice and generate speech at 2.0 tokens/sec. Bypasses consent if voice is saved."
>    - *Card 3 (Developer APIs)*: Title "Developer-First", description "RESTful JSON APIs and batch processing engines with low latency."
> 2. **Developer Code Block (Right side or underneath)**:
>    - A mockup code console with tabs: "cURL", "Node.js", "Python".
>    - A syntax-highlighted code block showing a POST request to `/api/v1/audio/speech` with headers (`X-API-Key`) and body parameters (`input`, `voice`).
>    - A "Copy Code" button that changes state on hover.

---

### Step 3: Landing Page & Public Pricing Section
*Use this to generate the pricing cards and payment guidelines introduction.*

> **Prompt:**
> Design a Pricing & Billing section for "Khmer Vox TTS".
> 
> **Structure & Content:**
> 1. **Toggle Switch**: "Monthly Billing" vs "Yearly Billing".
> 2. **Three Cards**:
>    - *Starter Card*: $9/mo, 10,000 tokens included, standard voices, email support. Outlined button.
>    - *Developer Card (Recommended)*: $29/mo, 40,000 tokens included, API access, cloning enabled. Highlighted with emerald borders and filled button.
>    - *Enterprise Card*: Custom pricing, unlimited tokens, custom SLA. Outlined button.
> 3. **Token Usage Key (Bottom)**: A clean legend explaining token rates:
>    - Preset voices: 1.5 tokens/sec.
>    - Custom/Cloned voices: 2.0 tokens/sec.

---

### Step 4: Payments & Checkout Page (`/payments`)
*Use this to generate the checkout page where users configure orders, view QR codes, and upload receipts.*

> **Prompt:**
> Design a Payments and Order Checkout Page for "Khmer Vox TTS".
> 
> **Structure & Content:**
> 1. **Order Summary (Left)**: Displays package name, token amount, price, and taxes.
> 2. **Bakong KHQR Payment Panel (Center)**:
>    - Displays a large QR code box with the Bakong KHQR logo.
>    - Explains: "Scan with your Cambodian mobile banking app (ABA, Acleda, etc.) to pay."
> 3. **Proof of Payment Upload (Right)**:
>    - Drag-and-drop input to upload transaction screenshot/receipt.
>    - A text input for "Transaction ID / Reference Number".
>    - A primary green "Submit Payment Proof" button.

---

### Step 5: Dashboard Layout Shell (Layout Wrapper)
*Use this to generate the navigation shell that wraps the dashboard.*

> **Prompt:**
> Design the Layout Shell for the "Khmer Vox TTS" signed-in user dashboard.
> 
> **Structure & Content:**
> 1. **Sidebar Navigation (Left)**:
>    - Logo at the top.
>    - Navigation links with glowing active states: "Workspace" (active), "Voice Library", "API Keys", "Billing & Tokens", "History", and "Settings".
>    - User profile badge at the bottom (Avatar, Name, Email, and Sign Out icon).
> 2. **Top Header Bar (Main Content area)**:
>    - Left: Title "Voice Workspace".
>    - Right: Active token balance badge (e.g. "Balance: 12,500 Tokens" in a glowing emerald outline) and a "Buy Tokens" button.
> 3. **Main Content Canvas (Center)**: A large, clean workspace container where the tool panels will load.

---

### Step 6: Voice Workspace - Standard TTS Editor Panel
*Use this to generate the Standard TTS text editor dashboard screen.*

> **Prompt:**
> Design the Standard TTS Editor workspace page for the "Khmer Vox TTS" dashboard.
> 
> **Structure & Content:**
> 1. **Mode Switcher**: Toggle pills: "Standard TTS" (active) and "Voice Cloning".
> 2. **Text Input Card**:
>    - Large textarea with a placeholder: "Paste or type Khmer text here...".
>    - Character limit indicator at the bottom-right: "0 / 5,000".
>    - Action row: "Clear", "Paste", "Load Sample Text" (outline button styles).
> 3. **Voice Configuration**:
>    - Dropdown for "Voice style" (lists Preset female/male and custom saved voices).
>    - A sleek "Manage Library" button next to it (with folder/library icon).
>    - Input field for "Model" (value: `voxcpm2`).
> 4. **Cost Estimate Footer**: Shows "Estimated Duration: ~0s", "Cost: 0 tokens" (calculated at the 1.5 tokens/sec rate).

---

### Step 7: Voice Workspace - Voice Cloning Uploader Panel
*Use this to generate the Voice Cloning dashboard workspace editor.*

> **Prompt:**
> Design the Voice Cloning Editor workspace page for the "Khmer Vox TTS" dashboard.
> 
> **Structure & Content:**
> 1. **Mode Switcher**: Toggle pills: "Standard TTS" and "Voice Cloning" (active).
> 2. **Reference Audio Upload Box**:
>    - A dashed drag-and-drop file uploader: "Upload reference audio (MP3/WAV, max 8MB)".
>    - Consent checkbox below it: "I own this voice or have permission from the owner."
> 3. **Text Input Card**: Large textarea for the Khmer script text.
> 4. **Voice Library Selector**: A dropdown to choose "Upload new reference file" (active) or select from "Saved Voices" list.
> 5. **Cost Estimate Footer**: Shows "Estimated Duration: ~0s", "Cost: 0 tokens" (calculated at the 2.0 tokens/sec cloning rate).

---

### Step 8: Voice Workspace - Audio Result & Stats Sidebar
*Use this to generate the right-hand panel that displays the audio output and metrics.*

> **Prompt:**
> Design a vertical Audio Result panel that displays on the right side of the dashboard workspace.
> 
> **Structure & Content:**
> 1. **Header**: "Audio Result" with a status indicator ("Ready", "Generating...", or "Empty").
> 2. **Generating/Loading State**: An animated circular progress indicator or pulsing green soundwave graphic.
> 3. **Player State**:
>    - A premium custom audio player showing standard controls (Play/Pause, volume, progress seek bar, and download icon button).
> 4. **Generation Metadata Table**:
>    - *Generation ID*: String UUID.
>    - *Latency*: e.g. "1,200 ms".
>    - *Credits Charged*: e.g. "10 tokens".
>    - *Output Format*: "MP3".
>    - *Duration*: "5.0 seconds".

---

### Step 9: Voice Library Manager (Modal / Standalone Page)
*Use this to generate the Saved Voice Library screen.*

> **Prompt:**
> Design a "Saved Voice Library" modal manager component for "Khmer Vox TTS".
> 
> **Structure & Content:**
> 1. **Header**: Title "Saved Voice Library" and a close button.
> 2. **Create New Voice Form (Top)**:
>    - Inputs: "Voice Name" (text) and "Description" (text).
>    - Dashed file input: "Select reference file (MP3 or WAV)".
>    - Button: "Save to Library" (emerald green).
> 3. **Saved Voices Grid (Bottom)**:
>    - Displays saved voices cards (e.g. Sokha, Piseth).
>    - Each card shows Name, Description, File size, format label (WAV/MP3), and a trash icon button labeled "Delete".

---

### Step 10: API Keys Management Portal (`/app/dashboard/api`)
*Use this to generate the Developer API key credentials screen.*

> **Prompt:**
> Design an API Keys management dashboard page for "Khmer Vox TTS".
> 
> **Structure & Content:**
> 1. **Header**: "API Keys" with a description and a primary "Create New Key" green button.
> 2. **Active Keys Table**: Lists columns: "Key Name", "API Key" (partially hidden: `kv_live_...••••`), "Created", "Last Used", "Status" (green Active badge), and "Actions" (Revoke button).
> 3. **Create Key Modal/Dialog (Overlay)**: A small modal form to name the API key, select permission limits, and display the full key once generated (with a "Copy to Clipboard" button).

---

### Step 11: Generation History & Jobs Table (`/app/dashboard/history`)
*Use this to generate the user generation history log screen.*

> **Prompt:**
> Design a "Generation History" log dashboard page for "Khmer Vox TTS".
> 
> **Structure & Content:**
> 1. **Header**: Title "Generation History" and a search bar to filter logs.
> 2. **History Table**:
>    - Columns: Date/Time, Source ("Web" vs "API"), Preview Text (Khmer snippet), Voice Used, Output Duration (seconds), Cost (tokens), and Actions (Play inline & Download icon buttons).
> 3. **Pagination Footer**: Page indicators ("1 of 12") and "Previous" / "Next" buttons.

---

### Step 12: Billing, Plans & Token Purchase (`/app/dashboard/billing`)
*Use this to generate the billing overview and token checkout screen.*

> **Prompt:**
> Design a "Billing & Tokens" dashboard page for "Khmer Vox TTS".
> 
> **Structure & Content:**
> 1. **Token Balance Dashboard**: Circular radial progress bar showing remaining tokens vs monthly allocation.
> 2. **Buy Tokens Grid**: Package options cards:
>    - *10,000 Tokens* for $5.
>    - *50,000 Tokens* for $20.
>    - *100,000 Tokens* for $35.
> 3. **Transactions History Table**: Lists token purchases, monthly refills, and generation charges with dates, amounts, and statuses.

---

### Step 13: Sign In & Sign Up Pages (`/app/signin` & `/app/signup`)
*Use this to generate the split-screen authentication interfaces.*

> **Prompt:**
> Design a premium split-screen Sign In page for "Khmer Vox TTS".
> 
> **Structure & Content:**
> 1. **Left Panel (Hero/Feature Panel)**:
>    - Midnight obsidian background.
>    - Displays a large glowing emerald graphic or simulated soundwave.
>    - Typographic headline: "Cambodia's Leading Khmer AI Voice Engine."
> 2. **Right Panel (Form Panel)**:
>    - Clean light-slate or white background.
>    - Form fields: "Email Address" and "Password".
>    - Actions: "Sign In" button, "Forgot Password?" link, and "Don't have an account? Sign Up" redirection.
