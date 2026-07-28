#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Artillery Load Test Runner ===${NC}\n"

# Check if docker compose is running
if ! docker compose -f docker-compose-development.yml ps | grep -q "Up"; then
  echo -e "${YELLOW}Starting Docker Compose...${NC}"
  docker compose -f docker-compose-development.yml up -d

  echo -e "${YELLOW}Waiting for application to be ready...${NC}"
  sleep 10

  # Wait for health check
  MAX_RETRIES=30
  RETRY_COUNT=0
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3000/api/v1/health > /dev/null 2>&1; then
      echo -e "${GREEN}Application is ready!${NC}\n"
      break
    fi
    echo -e "${YELLOW}Waiting for application to start... ($((RETRY_COUNT + 1))/$MAX_RETRIES)${NC}"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
  done

  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}Application failed to start in time${NC}"
    exit 1
  fi
else
  echo -e "${GREEN}Docker Compose is already running${NC}\n"
fi

# Ask user which test to run
echo -e "${YELLOW}Select load test level:${NC}"
echo "1) Low     - 5 requests/sec for 1 minute"
echo "2) Medium  - 25 requests/sec for 2 minutes"
echo "3) High    - 50-1000 requests/sec for 10 minutes"
echo "4) Massive - 1-1M requests/sec for 95 minutes"
echo "5) All     - Run all tests sequentially (108 minutes total)"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
  1)
    echo -e "\n${GREEN}Running LOW load test...${NC}\n"
    npm run artillery:low
    ;;
  2)
    echo -e "\n${GREEN}Running MEDIUM load test...${NC}\n"
    npm run artillery:medium
    ;;
  3)
    echo -e "\n${GREEN}Running HIGH load test...${NC}\n"
    npm run artillery:high
    ;;
  4)
    echo -e "\n${GREEN}Running MASSIVE load test...${NC}\n"
    npm run artillery:massive
    ;;
  5)
    echo -e "\n${GREEN}Running ALL load tests...${NC}\n"
    npm run artillery:all
    ;;
  *)
    echo -e "${RED}Invalid choice. Exiting.${NC}"
    exit 1
    ;;
esac

echo -e "\n${GREEN}Load test completed!${NC}"
