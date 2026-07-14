# FinBud AI

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![React](https://img.shields.io/badge/React-18-blue)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-38B2AC)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E)

FinBud AI is an advanced conversational AI platform designed for enterprise inbound and outbound voice operations. It enables seamless integration of AI-driven voice agents to automate operations and improve customer engagement.

## Features

- **Conversational AI Voice Agents:** Build and manage intelligent voice agents for customer support, sales, and operations.
- **Enterprise Ready:** Designed for scale with robust inbound and outbound calling capabilities.
- **Modern Dashboard:** Intuitive interface built with Next.js 14 and Tailwind CSS for seamless user experience.
- **Secure Authentication:** Integrated with Supabase Auth for robust and secure access control, including OAuth providers.

---

## Project Architecture & Tech Stack

The application follows a modern full-stack web architecture, separating the client interface from the backend infrastructure.

### 1. Frontend (Next.js & React)
- **Location:** `frontend/` directory.
- **Framework:** Next.js 14 (App Router), React, Tailwind CSS. Icons by `lucide-react`.
- **State Management:** User sessions are handled globally via `AuthContext` in `frontend/lib/auth-context.tsx`.

### 2. Backend & Database (Supabase)
- **Location:** `supabase/` directory (SQL migrations and schema definitions).
- **Platform:** Fully hosted on [Supabase](https://kijvprjaojetcposqkac.supabase.co).
- **Database:** Managed PostgreSQL database. Core tables include `users` and `subscription_plans`.
- **Authentication:** Handles all sign-up, sign-in, and OAuth flows securely.
- **Connectivity:** The frontend connects via `@supabase/supabase-js` and `@supabase/ssr` (initialized in `frontend/utils/supabase/`).

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- A Supabase project (if setting up from scratch)

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/finbud-ai.git
   cd finbud-ai
   ```

2. **Install Frontend Dependencies:**
   ```bash
   cd frontend
   npm install
   ```

3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   The app will be available at [http://localhost:3000](http://localhost:3000).

---

## Demo Accounts

We have established a standard set of credentials you can use to test the platform on our staging instance.

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@finbud.ai` | `admin123` |
| **User** | `demo@finbud.ai` | `demo123` |

*(Note: Since you own the Supabase instance locally, you can simply click "Sign Up" on the `http://localhost:3000/register` page to provision these accounts into your database, or use Google Sign-In.)*

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This project is licensed under the MIT License.
# finbud-ai
