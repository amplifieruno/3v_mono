dev-compose:
	docker-compose --env-file .env.dev -f docker/docker-compose.dev.yml up -d

dev:
	make dev-compose
	pnpm run dev

prod:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d --build --force-recreate

prod-back:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d backend --build --force-recreate
