#!/bin/bash
# TriFinity - Development Environment Setup Script
# "Geld is opgeslagen tijd" — Personal Finance App
#
# Tech Stack: Next.js 16, Supabase (PostgreSQL 17), React 19, Tailwind CSS v4
#

set -e

echo "=========================================="
echo "  TriFinity - Development Setup"
echo "  Geld is opgeslagen tijd"
echo "=========================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "Node.js version: $(node -v)"

if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js 18+ required. Current: $(node -v)"
    exit 1
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Check for .env.local
if [ ! -f ".env.local" ]; then
    if [ -f "env.example" ]; then
        echo ""
        echo "WARNING: .env.local not found. Copying from env.example..."
        echo "Please update .env.local with your Supabase credentials."
        cp env.example .env.local
    else
        echo ""
        echo "WARNING: No .env.local found. You may need to create one with:"
        echo "  NEXT_PUBLIC_SUPABASE_URL=your-supabase-url"
        echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key"
        echo "  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
    fi
fi

# Start the development server
echo ""
echo "=========================================="
echo "  Starting Next.js Development Server..."
echo "=========================================="
echo ""
echo "  App URL:     http://localhost:3000"
echo "  Dashboard:   http://localhost:3000/dashboard"
echo "  De Kern:     http://localhost:3000/core"
echo "  De Wil:      http://localhost:3000/will"
echo "  De Horizon:  http://localhost:3000/horizon"
echo ""
echo "  Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

npm run dev
