
# How to set up

## Step 0

Check if you have them as follows:

```bash
node -v
npm -v
```

If not, refer to [https://nodejs.org/zh-cn/download]

## Step 1

```bash
mkdir LLMath
cd LLMath
```

## Step 2

```bash
npx create-next-app@latest frontend
```

New files will appear like this:

```
frontend/
├── public/
│ ├── app/
│ │ ├── page.tsx # replace this
│ │ ├── layout.tsx
│ │ └── globals.css
│ └── ...
└── ...
```

And replace .tsx files.

## Step 3

```bash
cd frontend
npm install react-markdown rehype-katex remark-math lucide-react clsx tailwind-merge
npm run dev
```

## Step 4

New bash

```bash
cd LLMath
mkdir backend
```

Copy main.py to backend/

## Step 5

Replace .tsx files.

## Step 6

```bash
cd backend
uvicorn main:app --reload
```

Completed!
