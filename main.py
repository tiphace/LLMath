import os
import io
import json
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from contextlib import redirect_stdout
import sympy
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"), 
    base_url="xxx"
)

class ProofStep(BaseModel):
    index: int
    content: str      
    code: str         
    output: str       
    status: str = "normal" 

class SolveRequest(BaseModel):
    problem: str

class UpdateRequest(BaseModel):
    current_steps: list[ProofStep] 
    edit_index: int                
    new_content: str
    problem: str

SYSTEM_PROMPT = """
你是一个“数学辅助求解专家”。
请生成一份**像教科书一样流畅**的数学证明步骤。将解题过程尽可能细致地拆分为严格的逻辑步骤。但不要重述原问题。

【输出格式】
只输出一个 JSON 对象：
{
  "steps": [
    {
      "content": "这里写这一步的详细描述。必须将数学公式自然地穿插在文本中。行内公式用 $...$ 包裹，独立公式用 $$...$$ 包裹。例如：'我们对函数 $f(x)$ 求导，得到：$$ f'(x)=2x $$'",
      "code": "Python SymPy 代码，用于验证这一步。必须包含 print(sympy.latex(result))",
      "status": "normal"
    }
  ]
}

【要求】
1. 代码必须可执行。
2. **输出规范**：
   - 严禁在 print 中包含 '结果是：' 或 'Result:' 等提示语。
   - **必须且只能** 打印 LaTeX 字符串。
   - 错误示范：print(f'结果: {sympy.latex(res)}')
   - 正确示范：print(sympy.latex(res))
   - 如果有多个结果，请分行打印。
"""

def execute_steps(steps_data):
    session_globals = {"sympy": sympy, "sp": sympy}
    verified_steps = []
    
    for i, step in enumerate(steps_data):
        code = step['code']
        buffer = io.StringIO()
        try:
            with redirect_stdout(buffer):
                exec(code, session_globals)
            output = buffer.getvalue().strip()
            if not output: output = "\\text{No Output}"
            
            verified_steps.append({
                "index": 0,
                "content": step['content'],
                "code": code,
                "output": output,
                "status": step.get('status', 'normal')
            })
            
        except Exception as e:
            return False, verified_steps, str(e)
            
    return True, verified_steps, None

async def generate_proof_chain(messages, start_index=1, max_retries=3):
    history = messages
    
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=history,
                response_format={ "type": "json_object" },
                temperature=0.3
            )
            content = response.choices[0].message.content
            plan = json.loads(content)
            
            if "steps" not in plan: continue

            success, verified_steps, error_msg = execute_steps(plan['steps'])
            
            if success:
                for i, s in enumerate(verified_steps):
                    s['index'] = start_index + i
                return verified_steps
            else:
                history.append({"role": "assistant", "content": content})
                history.append({"role": "system", "content": f"Code Error: {error_msg}"})
                continue
                
        except Exception:
            continue
            
    return [{
        "index": start_index,
        "content": "**生成失败**: 无法构建有效的证明路径。",
        "code": "# Error",
        "output": "\\text{Error}",
        "status": "error"
    }]

@app.post("/api/solve")
async def solve_endpoint(req: SolveRequest):
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"请完整解决这个问题：{req.problem}"}
    ]
    steps = await generate_proof_chain(messages)
    return {"steps": steps}

@app.post("/api/update_step")
async def update_endpoint(req: UpdateRequest):
    previous_steps = req.current_steps[:req.edit_index-1]
    prev_code_summary = "\n".join([s.code for s in previous_steps])
    
    # 把 "原始问题" (req.problem) 放在显眼的位置
    UPDATE_PROMPT = f"""
    你是一个严谨的数学引擎。
    
    【终极目标】
    我们必须解决原始问题：**"{req.problem}"**
    请时刻牢记这个目标，不要偏题。
    
    【当前进度】
    前 {req.edit_index - 1} 步已确立（代码已执行）：
    {prev_code_summary}
    
    【用户修改】
    用户将第 {req.edit_index} 步修改为：
    "{req.new_content}"
    
    【任务】
    1. **一致性检查**：用户的修改是否符合数学逻辑？是否能承接上文？
    2. **目标导向检查**：用户的修改是否依然有助于解决【终极目标】？
       - 如果用户把“求积分”改成了“求导”，这属于偏离目标，应判为 error。
    3. **输出内容约束**：虽然进行一些检查和判断，但输出内容应该是直接面向用户的，要客观陈述正确与否，不能直白地陈述你需要检查，检查什么，而是以教导用户的方式陈述。
    
    【情况 A：修改有效且指向目标】
    - 重写该步骤内容（status="valid"）。
    - **继续生成后续步骤**，直到彻底解决【终极目标】。
    
    【情况 B：修改无效或偏离目标】
    - 只输出这一步。
    - status="error"。
    - content 说明原因（例如：“此修改导致无法解决原始积分问题...”）。
    """
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT}, 
        {"role": "user", "content": UPDATE_PROMPT}
    ]
    
    new_steps = await generate_proof_chain(messages, start_index=len(previous_steps)+1)
    
    final_steps = [s.model_dump() for s in previous_steps] + new_steps
    return {"steps": final_steps}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
