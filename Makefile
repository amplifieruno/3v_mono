dev-compose:
	docker-compose --env-file .env.dev -f docker/docker-compose.dev.yml up -d

dev:
	make dev-compose
	pnpm run dev

prod:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d