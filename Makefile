# Makefile for Novita GPU Instance API

.PHONY: help build dev prod test clean logs health backup

# Default target
help: ## Show this help message
	@echo "Novita GPU Instance API - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

# Development commands
dev: ## Start development environment
	@echo "🚀 Starting development environment..."
	@./scripts/deploy-dev.sh

dev-build: ## Build and start development environment
	@echo "🔨 Building development environment..."
	@docker-compose build
	@$(MAKE) dev

dev-logs: ## View development logs
	@docker-compose logs -f

dev-stop: ## Stop development environment
	@echo "🛑 Stopping development environment..."
	@docker-compose down

# Production commands
prod: ## Deploy to production
	@echo "🚀 Deploying to production..."
	@./scripts/deploy-prod.sh

prod-build: ## Build production image
	@echo "🔨 Building production image..."
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

prod-logs: ## View production logs
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

prod-stop: ## Stop production environment
	@echo "🛑 Stopping production environment..."
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# Testing commands
test: ## Run tests
	@echo "🧪 Running tests..."
	@npm test

test-watch: ## Run tests in watch mode
	@echo "🧪 Running tests in watch mode..."
	@npm run test:watch

test-coverage: ## Run tests with coverage
	@echo "🧪 Running tests with coverage..."
	@npm test -- --coverage

# Build commands
build: ## Build the application
	@echo "🔨 Building application..."
	@npm run build

build-docker: ## Build Docker image
	@echo "🐳 Building Docker image..."
	@docker build -t novita-gpu-instance-api:latest .

# Utility commands
clean: ## Clean up containers, images, and volumes
	@echo "🧹 Cleaning up..."
	@docker-compose down -v --remove-orphans
	@docker system prune -f
	@docker volume prune -f

logs: ## View application logs
	@docker-compose logs -f novita-gpu-api

health: ## Check service health
	@echo "🏥 Checking service health..."
	@./scripts/health-check.sh

backup: ## Create backup
	@echo "💾 Creating backup..."
	@./scripts/backup.sh

# Setup commands
setup: ## Initial setup (copy .env.example to .env)
	@echo "⚙️  Setting up environment..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ Created .env file from example"; \
		echo "⚠️  Please edit .env and set your NOVITA_API_KEY"; \
	else \
		echo "✅ .env file already exists"; \
	fi
	@mkdir -p logs
	@chmod 755 logs
	@echo "✅ Setup complete"

install: ## Install dependencies
	@echo "📦 Installing dependencies..."
	@npm install

# Linting and formatting
lint: ## Run linter
	@echo "🔍 Running linter..."
	@npm run lint

lint-fix: ## Fix linting issues
	@echo "🔧 Fixing linting issues..."
	@npm run lint:fix

# Docker management
docker-clean: ## Clean Docker resources
	@echo "🧹 Cleaning Docker resources..."
	@docker container prune -f
	@docker image prune -f
	@docker volume prune -f
	@docker network prune -f

docker-reset: ## Reset Docker environment completely
	@echo "🔄 Resetting Docker environment..."
	@docker-compose down -v --remove-orphans
	@docker rmi novita-gpu-instance-api:latest 2>/dev/null || true
	@$(MAKE) docker-clean

# Status commands
status: ## Show service status
	@echo "📊 Service Status:"
	@docker-compose ps
	@echo ""
	@echo "🐳 Docker Images:"
	@docker images | grep novita-gpu-instance-api || echo "No images found"
	@echo ""
	@echo "📦 Docker Volumes:"
	@docker volume ls | grep novita || echo "No volumes found"

# Quick commands
up: dev ## Alias for dev
down: dev-stop ## Alias for dev-stop
restart: ## Restart development environment
	@$(MAKE) dev-stop
	@$(MAKE) dev