# Writers Support Website Deployment

## Frontend on Netlify
1. Push this project to GitHub.
2. In Netlify, create a new site from Git.
3. Choose the repository and set the publish directory to `.`.
4. Deploy.

## Backend on Render
1. Create a new Web Service in Render.
2. Connect the same GitHub repository.
3. Set the start command to `node server.js`.
4. Add environment variables:
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://your-netlify-site.netlify.app`
   - `JWT_SECRET=change-this-to-a-strong-secret`
   - `ADMIN_USER=admin`
   - `ADMIN_PASSWORD=your-secure-password`
   - `EMAIL_USER=writerssupport40@gmail.com`
   - `EMAIL_PASSWORD=your-gmail-app-password`
5. Deploy.

## Frontend API URL
The frontend is already configured to use:
- your local backend at `http://localhost:3000` during development
- your Render backend automatically when deployed on Netlify, if you set a global variable before deployment

For a production-ready setup, replace the local fallback in the HTML files with your Render URL if needed.
