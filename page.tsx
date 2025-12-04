"use client";

import {useState} from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { 
  Play, RotateCcw, Edit2, X, ChevronDown, CheckCircle, AlertCircle, Terminal, Lock, Undo
} from "lucide-react";

const preprocessLaTeX = (content: string) => {
  if (!content) return "";
  let processed = content.trim();

  if (!processed.includes("$")) {
     const hasChinese = /[\u4e00-\u9fa5]/.test(processed);
     if (!hasChinese) {
        processed = processed.replace(/\n/g, ' \\\\ ');
        processed = `$$ ${processed} $$`;
     }
  }

  return processed
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$1$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
};

const MathRenderer = ({ content, isOutput = false }: { content: string, isOutput?: boolean }) => (
  <div className={`
    prose prose-sm max-w-none text-black 
    [&_.katex]:text-black [&_.katex-html]:text-black
    ${isOutput 
       ? 'text-lg text-center py-3 font-serif overflow-x-auto' 
       : 'leading-loose'} 
  `}>
    <ReactMarkdown 
      remarkPlugins={[remarkMath]} 
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({node, ...props}) => <p className="mb-3 whitespace-pre-wrap" {...props} />
      }}
    >
      {preprocessLaTeX(content)}
    </ReactMarkdown>
  </div>
);

type Step = {
  index: number;
  content: string;
  code: string;
  output: string;
  status: "normal" | "valid" | "error";
};

export default function Home() {
  const [problem, setProblem] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [backupSteps, setBackupSteps] = useState<Step[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingEditId, setPendingEditId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const handleSolve = async () => {
    if (!problem.trim()) return;
    setLoading(true);
    setSteps([]); 
    setBackupSteps([]);
    try {
      const res = await fetch("http://localhost:8000/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem }),
      });
      const data = await res.json();
      setSteps(data.steps || []);
    } catch (e) {
      alert("连接失败，请检查后端服务");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (step: Step) => {
    if (loading || step.index === 1) return;
    setEditingId(step.index);
    setEditContent(step.content); 
  };

  const submitEdit = async (index: number) => {
    setLoading(true);
    setEditingId(null);
    setPendingEditId(index);
    
    // 保存快照
    setBackupSteps([...steps]);

    try {
      const res = await fetch("http://localhost:8000/api/update_step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_steps: steps,
          edit_index: index,
          new_content: editContent,
          problem: problem
        }),
      });
      const data = await res.json();
      setSteps(data.steps || []); 
    } catch (e) {
      alert("更新失败");
    } finally {
      setLoading(false);
      setPendingEditId(null);
    }
  };

  // 回退功能
  const handleRollback = () => {
    if (backupSteps.length > 0) {
      setSteps(backupSteps);
      setBackupSteps([]); // 回退后清空备份
    }
  };

  const getStepContainerClass = (step: Step) => {
    const base = "relative bg-white rounded-xl border transition-all duration-300";
    if (step.status === "valid") return `${base} border-green-500 shadow-[0_0_15px_-3px_rgba(34,197,94,0.3)]`;
    if (step.status === "error") return `${base} border-red-500 bg-red-50/10 shadow-[0_0_15px_-3px_rgba(239,68,68,0.3)]`;
    return `${base} border-gray-200 hover:border-indigo-300 hover:shadow-md`;
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      
      {/* 左侧：输入区 */}
      <div className="w-1/3 flex flex-col border-r border-gray-200 bg-white p-6 shadow-xl z-10">
        <h1 className="text-xl font-bold text-indigo-700 mb-6 flex items-center gap-2">
          <RotateCcw className="w-6 h-6" /> LLMath: Neural-Symbolic Reasoning Tool
        </h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">在下方输入您的问题</label>
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 h-40 resize-none shadow-inner bg-gray-50 text-sm"
              placeholder="例如: 求 e^x 的导函数."
            />
          </div>
          <button
            onClick={handleSolve}
            disabled={loading || !problem}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"/> : <Play size={18} />}
            开始推理
          </button>
        </div>
      </div>

      {/* 右侧：证明面板 */}
      <div className="w-2/3 bg-slate-50 p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          
          {(steps || []).length === 0 && !loading && (
             <div className="text-center text-gray-400 mt-24">
                <p className="text-lg font-medium">等待输入...</p>
             </div>
          )}

          {(steps || []).map((step) => {
            const isFaded = loading && pendingEditId !== null && step.index >= pendingEditId;
            const isFirstStep = step.index === 1;

            return (
              <div 
                key={step.index} 
                className={`
                  ${editingId === step.index ? 'border-indigo-500 ring-4 ring-indigo-50/50 shadow-xl z-20 relative bg-white rounded-xl border' : getStepContainerClass(step)}
                  ${isFaded ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'}
                `}
              >
                {/* 序号 */}
                <div className={`absolute -left-4 top-6 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border shadow-sm z-10
                   ${step.status === 'valid' ? 'bg-green-500 text-white border-green-600' : 
                     step.status === 'error' ? 'bg-red-500 text-white border-red-600' :
                     'bg-white text-gray-500 border-gray-200'}
                `}>
                  {step.status === 'valid' ? <CheckCircle size={14}/> : 
                   step.status === 'error' ? <AlertCircle size={14}/> : 
                   step.index}
                </div>
                
                <div className="absolute left-[-1px] top-14 bottom-[-24px] w-0.5 bg-gray-100 -z-10 last:hidden" />

                <div className="p-6">
                  {editingId === step.index ? (
                    // 编辑模式
                    <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex justify-between items-center text-sm font-bold text-indigo-700 bg-indigo-50 p-2 rounded">
                        <span className="flex items-center gap-2"><Edit2 size={14}/> 修改此步</span>
                        <X size={16} className="cursor-pointer text-gray-400 hover:text-red-500" onClick={() => setEditingId(null)} />
                      </div>
                      <textarea 
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full p-4 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm leading-relaxed shadow-inner font-mono"
                        rows={6}
                      />
                      <div className="flex justify-end gap-3 pt-2">
                         <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
                         <button onClick={() => submitEdit(step.index)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1 shadow-md">
                           <RotateCcw size={12} /> 确认并请求重新推导
                         </button>
                      </div>
                    </div>
                  ) : (
                    // 展示模式
                    <div 
                        className={`group ${!isFirstStep ? 'cursor-pointer' : 'cursor-default'}`} 
                        onClick={() => startEdit(step)}
                    >
                      
                      {!isFirstStep ? (
                        <div className="flex justify-end mb-[-20px] relative z-10">
                          <div className="text-xs text-indigo-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-50 px-2 py-1 rounded-full flex items-center gap-1 hover:bg-indigo-100 hover:shadow-sm">
                            <Edit2 size={12}/> 点击修改
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end mb-[-20px] relative z-10">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[14px] text-red-500 flex items-center gap-1 px-2 py-1">
                                <Lock size={10} /> 初始条件不可修改
                            </div>
                        </div>
                      )}

                      <div className="min-h-[40px]">
                        <MathRenderer content={step.content} />
                      </div>

                      {/* 如果状态是 Error，显示回退按钮 */}
                      {step.status === 'error' && (
                        <div className="mt-4 mb-2 flex justify-end animate-in fade-in slide-in-from-top-2">
                           <button 
                             onClick={(e) => {
                               e.stopPropagation(); // 阻止触发编辑
                               handleRollback();
                             }}
                             className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-md transition-all active:scale-95 text-xs font-bold"
                           >
                             <Undo size={14} />
                             修改无效, 可以选择回退
                           </button>
                        </div>
                      )}

                      <details 
                        className="mt-4 border-t border-gray-100 pt-2" 
                        onClick={(e) => e.stopPropagation()} 
                      >
                        <summary className="list-none flex items-center gap-1.5 cursor-pointer text-gray-400 hover:text-indigo-600 w-fit transition-colors select-none text-xs">
                          <Terminal size={12} /> 
                          <span className="font-medium">查看 SymPy 验证详情</span>
                          <ChevronDown size={12} className="opacity-50" />
                        </summary>
                        
                        <div className="mt-3 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                          <div className="bg-slate-900 p-3 overflow-x-auto">
                            <pre className="text-slate-200 font-mono text-[11px] leading-relaxed whitespace-pre">
                              {step.code}
                            </pre>
                          </div>
                          
                          <div className="p-3 border-t border-slate-200 bg-white">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Execution Output</div>
                            <div className="text-indigo-900 w-full">
                                <MathRenderer content={step.output} isOutput={true} />
                            </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {loading && pendingEditId === null && (
             <div className="flex justify-center p-8 animate-pulse">
                <span className="text-indigo-600 font-bold text-sm">正在寻找一种可能的解...</span>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
