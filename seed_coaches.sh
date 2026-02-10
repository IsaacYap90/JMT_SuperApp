#!/bin/bash

# Configuration
SUPABASE_URL="https://xioimcyqglfxqumvbqsg.supabase.co"
# You need to fill in your ADMIN_JWT token here (Log in as Jeremy and copy the access_token from localStorage or network tab)
# OR use the Service Role Key if you modify the function to accept it, but the function checks for "role: admin" in the user_token.
# 
# EASIER PATH: Since we can't easily get a JWT here without logging in via a browser...
# We can modify the `create-user` function temporarily to accept a Service Role Key bypass?
# No, let's assume you can get a JWT.
ADMIN_JWT="YOUR_ADMIN_JWT_HERE"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpb2ltY3lxZ2xmeHF1bXZicXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Mzk5NTcsImV4cCI6MjA4NTMxNTk1N30.mgEsMIJUZqWmFVST0roe33XPU_KBASXgnwo0FEV1BvA"

# Function to create user
create_coach() {
  local email=$1
  local name=$2
  local role=$3
  
  echo "Creating $name ($email)..."
  
  curl -X POST "$SUPABASE_URL/functions/v1/create-user" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ANON_KEY" \
    -d "{
      \"email\": \"$email\",
      \"password\": \"JMT1234\",
      \"full_name\": \"$name\",
      \"role\": \"$role\",
      \"user_token\": \"$ADMIN_JWT\"
    }"
  
  echo -e "\n"
}

# The Roster
create_coach "jeremy@jmt.com" "Jeremy Jude" "master_admin"
create_coach "shafiq@jmt.com" "Shafiq Nuri" "coach"
create_coach "sasi@jmt.com" "Sasi" "coach"
create_coach "heng@jmt.com" "Heng" "coach"
create_coach "larvin@jmt.com" "Larvin" "coach"
create_coach "isaac@jmt.com" "Isaac Yap" "coach"

echo "Done! Default password for all: JMT1234"
