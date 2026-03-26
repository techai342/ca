import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  History, 
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Activity,
  ArrowRightLeft,
  Atom
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as math from 'mathjs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from './lib/utils';

// --- Types ---
type AngleMode = 'deg' | 'rad';
type CalcMode = 'COMP' | 'CMPLX' | 'BASE' | 'SD' | 'REG';
type AppMode = 'CALC' | 'GRAPH' | 'CONV' | 'CONST';

interface CalculationHistory {
  expression: string;
  result: string;
  timestamp: number;
}

// --- Constants ---
const SCIENTIFIC_CONSTANTS = [
  { symbol: 'c', name: 'Speed of light', value: '299792458', unit: 'm/s' },
  { symbol: 'h', name: 'Planck constant', value: '6.62607015e-34', unit: 'J⋅s' },
  { symbol: 'G', name: 'Gravitational constant', value: '6.67430e-11', unit: 'm³/(kg⋅s²)' },
  { symbol: 'e', name: 'Elementary charge', value: '1.602176634e-19', unit: 'C' },
  { symbol: 'me', name: 'Electron mass', value: '9.1093837015e-31', unit: 'kg' },
  { symbol: 'mp', name: 'Proton mass', value: '1.67262192369e-27', unit: 'kg' },
  { symbol: 'NA', name: 'Avogadro constant', value: '6.02214076e23', unit: 'mol⁻¹' },
  { symbol: 'k', name: 'Boltzmann constant', value: '1.380649e-23', unit: 'J/K' },
  { symbol: 'R', name: 'Molar gas constant', value: '8.314462618', unit: 'J/(mol⋅K)' },
  { symbol: 'F', name: 'Faraday constant', value: '96485.33212', unit: 'C/mol' },
];

const UNIT_CATEGORIES = {
  Length: ['m', 'cm', 'mm', 'km', 'in', 'ft', 'yd', 'mi'],
  Mass: ['kg', 'g', 'mg', 'lb', 'oz'],
  Temperature: ['degC', 'degF', 'K'],
  Volume: ['l', 'ml', 'gal', 'qt', 'pt', 'cup', 'fl_oz'],
  Area: ['m2', 'cm2', 'km2', 'sqin', 'sqft', 'sqyd', 'sqmi', 'acre', 'hectare'],
};

// --- Components ---

const CalcButton = ({ 
  children, 
  onClick, 
  className, 
  variant = 'default',
  span = 1,
  labelTop,
  labelTopColor = 'text-yellow-500',
  labelAlpha,
  labelAlphaColor = 'text-red-400'
}: { 
  children: React.ReactNode; 
  onClick: () => void; 
  className?: string;
  variant?: 'default' | 'accent' | 'function' | 'memory' | 'numpad' | 'control';
  span?: number;
  labelTop?: string;
  labelTopColor?: string;
  labelAlpha?: string;
  labelAlphaColor?: string;
}) => {
  const variants = {
    default: 'bg-[#3a3e44] hover:bg-[#4a4e54] text-white',
    accent: 'bg-calc-accent hover:bg-calc-accent-hover text-white font-bold',
    function: 'bg-[#2a2d32] hover:bg-[#3a3e44] text-white text-[10px] sm:text-xs font-medium',
    memory: 'bg-[#2a2d32] hover:bg-[#3a3e44] text-white text-[10px] uppercase tracking-wider',
    numpad: 'bg-[#e5e7eb] hover:bg-[#d1d5db] text-[#1a1a1a] font-bold text-lg sm:text-xl',
    control: 'bg-[#4b5563] hover:bg-[#374151] text-white font-bold',
  };

  return (
    <div className={cn('flex flex-col items-center w-full h-full', span === 2 && 'col-span-2')}>
      <div className="flex justify-between w-full px-1 text-[8px] sm:text-[9px] font-bold uppercase tracking-tighter h-3 mb-0.5 shrink-0">
        <span className={cn(labelTopColor)}>{labelTop}</span>
        <span className={cn(labelAlphaColor)}>{labelAlpha}</span>
      </div>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        className={cn(
          'w-full flex-1 rounded-lg flex items-center justify-center transition-colors duration-200 shadow-md border-b-2 border-black/20',
          variants[variant],
          className
        )}
      >
        {children}
      </motion.button>
    </div>
  );
};

export default function App() {
  const [display, setDisplay] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<CalculationHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [angleMode, setAngleMode] = useState<AngleMode>('deg');
  const [calcMode, setCalcMode] = useState<CalcMode>('COMP');
  const [appMode, setAppMode] = useState<AppMode>('CALC');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isShift, setIsShift] = useState(false);
  const [isAlpha, setIsAlpha] = useState(false);
  const [memory, setMemory] = useState<number>(0);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Graphing State
  const [graphData, setGraphData] = useState<any[]>([]);
  
  // Converter State
  const [convCategory, setConvCategory] = useState<keyof typeof UNIT_CATEGORIES>('Length');
  const [convFrom, setConvFrom] = useState('m');
  const [convTo, setConvTo] = useState('cm');
  const [convValue, setConvValue] = useState('1');
  const [convResult, setConvResult] = useState('');

  const displayRef = useRef<HTMLDivElement>(null);

  // --- Logic ---

  const handleCalculate = useCallback(() => {
    if (!display) return;
    
    if (appMode === 'GRAPH') {
      try {
        const expr = math.compile(display.replace(/X/g, 'x').replace(/×/g, '*').replace(/÷/g, '/'));
        const data = [];
        for (let x = -10; x <= 10; x += 0.5) {
          try {
            const y = expr.evaluate({ x });
            if (typeof y === 'number' && !isNaN(y) && isFinite(y)) {
              data.push({ x, y });
            }
          } catch (e) {
            // Skip invalid points
          }
        }
        setGraphData(data);
        setError(null);
      } catch (err) {
        setError('Syntax ERROR');
        setGraphData([]);
      }
      return;
    }

    try {
      let expressionToEval = display
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, 'pi')
        .replace(/√\(/g, 'sqrt(')
        .replace(/³√\(/g, 'cbrt(')
        .replace(/log\(/g, 'log10(')
        .replace(/ln\(/g, 'log(')
        .replace(/Ans/g, history[0]?.result || '0')
        .replace(/EXP/g, '*10^')
        .replace(/C/g, ' combinations ')
        .replace(/P/g, ' permutations ');

      // Handle trig functions with angle mode
      if (angleMode === 'deg') {
        expressionToEval = expressionToEval
          .replace(/sin\(/g, 'sin(deg ')
          .replace(/cos\(/g, 'cos(deg ')
          .replace(/tan\(/g, 'tan(deg ')
          .replace(/asin\(/g, 'asin(')
          .replace(/acos\(/g, 'acos(')
          .replace(/atan\(/g, 'atan(');
      }

      const evaluated = math.evaluate(expressionToEval);
      const formattedResult = math.format(evaluated, { precision: 14 });
      
      setResult(formattedResult.toString());
      setHistory(prev => [{
        expression: display,
        result: formattedResult.toString(),
        timestamp: Date.now()
      }, ...prev].slice(0, 50));
      setHistoryIndex(-1);
      setError(null);
    } catch (err) {
      setError('Syntax ERROR');
      setResult(null);
    }
  }, [display, angleMode, history, appMode]);

  const handleInput = (val: string, shiftVal?: string, alphaVal?: string) => {
    setError(null);
    let finalVal = val;
    if (isShift && shiftVal !== undefined) {
      finalVal = shiftVal;
    } else if (isAlpha && alphaVal !== undefined) {
      finalVal = alphaVal;
    }
    setIsShift(false);
    setIsAlpha(false);

    if (!finalVal) return;

    if (result && !['+', '-', '×', '÷', '^', '!', '%'].includes(finalVal)) {
      setDisplay(finalVal);
      setCursorPos(finalVal.length);
      setResult(null);
      setHistoryIndex(-1);
    } else if (result) {
      setDisplay(result + finalVal);
      setCursorPos((result + finalVal).length);
      setResult(null);
      setHistoryIndex(-1);
    } else {
      setDisplay(prev => {
        const before = prev.slice(0, cursorPos);
        const after = prev.slice(cursorPos);
        return before + finalVal + after;
      });
      setCursorPos(prev => prev + finalVal.length);
    }
  };

  const clearAll = () => {
    setDisplay('');
    setCursorPos(0);
    setResult(null);
    setError(null);
    setIsShift(false);
    setIsAlpha(false);
    setHistoryIndex(-1);
    setGraphData([]);
  };

  const backspace = () => {
    if (result) {
      setResult(null);
      return;
    }
    if (cursorPos > 0) {
      setDisplay(prev => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
      setCursorPos(prev => prev - 1);
    }
  };

  const handleMemory = (action: 'MC' | 'MR' | 'M+' | 'M-') => {
    try {
      const currentVal = result ? parseFloat(result) : (display ? math.evaluate(display.replace(/×/g, '*').replace(/÷/g, '/')) : 0);
      switch (action) {
        case 'MC': setMemory(0); break;
        case 'MR': handleInput(memory.toString()); break;
        case 'M+': setMemory(prev => prev + currentVal); break;
        case 'M-': setMemory(prev => prev - currentVal); break;
      }
    } catch (e) {
      setError('Memory Error');
    }
  };

  // D-Pad Navigation
  const moveCursorLeft = () => setCursorPos(prev => Math.max(0, prev - 1));
  const moveCursorRight = () => setCursorPos(prev => Math.min(display.length, prev + 1));
  const moveHistoryUp = () => {
    if (history.length === 0) return;
    const nextIdx = Math.min(history.length - 1, historyIndex + 1);
    setHistoryIndex(nextIdx);
    setDisplay(history[nextIdx].expression);
    setCursorPos(history[nextIdx].expression.length);
    setResult(history[nextIdx].result);
  };
  const moveHistoryDown = () => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      setDisplay(history[nextIdx].expression);
      setCursorPos(history[nextIdx].expression.length);
      setResult(history[nextIdx].result);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setDisplay('');
      setCursorPos(0);
      setResult(null);
    }
  };

  // Unit Converter Logic
  useEffect(() => {
    if (appMode === 'CONV' && convValue) {
      try {
        let res;
        if (convCategory === 'Temperature') {
           // mathjs handles temperature conversions differently sometimes, but let's try standard
           res = math.evaluate(`${convValue} ${convFrom} to ${convTo}`);
        } else {
           res = math.evaluate(`${convValue} ${convFrom} to ${convTo}`);
        }
        setConvResult(math.format(res, { precision: 6 }).toString());
      } catch (e) {
        setConvResult('Error');
      }
    }
  }, [convValue, convFrom, convTo, convCategory, appMode]);

  const handleCategoryChange = (cat: keyof typeof UNIT_CATEGORIES) => {
    setConvCategory(cat);
    setConvFrom(UNIT_CATEGORIES[cat][0]);
    setConvTo(UNIT_CATEGORIES[cat][1]);
  };

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModeMenuOpen || appMode !== 'CALC' && appMode !== 'GRAPH') return;
      
      if (e.key >= '0' && e.key <= '9') handleInput(e.key);
      if (e.key === '.') handleInput('.');
      if (e.key === '+') handleInput('+');
      if (e.key === '-') handleInput('-');
      if (e.key === '*') handleInput('×');
      if (e.key === '/') handleInput('÷');
      if (e.key === '(') handleInput('(');
      if (e.key === ')') handleInput(')');
      if (e.key === '^') handleInput('^');
      if (e.key === 'ArrowLeft') moveCursorLeft();
      if (e.key === 'ArrowRight') moveCursorRight();
      if (e.key === 'ArrowUp') moveHistoryUp();
      if (e.key === 'ArrowDown') moveHistoryDown();
      if (e.key === 'Enter' || e.key === '=') handleCalculate();
      if (e.key === 'Backspace') backspace();
      if (e.key === 'Escape') clearAll();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCalculate, display, result, cursorPos, historyIndex, history, isModeMenuOpen, appMode]);

  useEffect(() => {
    if (displayRef.current) {
      // Auto-scroll to cursor position
      const scrollWidth = displayRef.current.scrollWidth;
      const clientWidth = displayRef.current.clientWidth;
      const ratio = cursorPos / Math.max(1, display.length);
      displayRef.current.scrollLeft = (scrollWidth - clientWidth) * ratio;
    }
  }, [display, cursorPos]);

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-0 sm:p-4 md:p-8 bg-[#1a1a1a] overflow-hidden">
      {/* Calculator Body */}
      <div className="w-full max-w-[400px] aspect-[9/16] max-h-[100dvh] bg-[#373a40] sm:rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col relative p-3 sm:p-5 mx-auto border-y-4 sm:border-4 border-[#2a2d32]">
        
        {/* Brand & Solar Panel */}
        <div className="flex justify-between items-start mb-2 sm:mb-4 px-2 sm:px-4 shrink-0">
          <div className="flex flex-col">
            <span className="text-white font-bold text-lg sm:text-xl tracking-tighter italic">SAQIB</span>
            <span className="text-white/60 text-[9px] sm:text-[10px] font-bold">fx-991MS PRO</span>
            <span className="text-white/40 text-[7px] sm:text-[8px] font-bold tracking-widest">S-V.P.A.M.</span>
            <span className="text-white/40 text-[7px] sm:text-[8px] font-bold self-end -mt-2">3rd edition</span>
          </div>
          <div className="bg-[#1a1a1a] w-20 sm:w-24 h-6 sm:h-8 rounded-md border border-white/10 flex items-center justify-center gap-1">
            {[1,2,3,4].map(i => <div key={i} className="w-3 sm:w-4 h-4 sm:h-6 bg-[#2a211a] rounded-sm opacity-50 shadow-inner" />)}
          </div>
        </div>

        {/* Display Screen */}
        <div className="bg-[#c3d3d1] mx-2 rounded-lg p-2 sm:p-3 mb-3 sm:mb-5 shadow-inner border-2 border-[#8a9a98] h-[18%] min-h-[80px] flex flex-col justify-between font-mono relative overflow-hidden shrink-0">
          {/* Status Bar */}
          <div className="flex justify-between text-[9px] sm:text-[10px] text-[#2a3a38] font-bold">
            <div className="flex gap-2">
              <span className={cn(isShift ? 'opacity-100' : 'opacity-10')}>S</span>
              <span className={cn(isAlpha ? 'opacity-100' : 'opacity-10')}>A</span>
              <span className={cn(memory !== 0 ? 'opacity-100' : 'opacity-10')}>M</span>
            </div>
            <div className="flex gap-2">
              <span className={cn(angleMode === 'deg' ? 'opacity-100' : 'opacity-10')}>D</span>
              <span className={cn(angleMode === 'rad' ? 'opacity-100' : 'opacity-10')}>R</span>
              <span className="opacity-100">{appMode}</span>
            </div>
          </div>

          {appMode === 'CALC' || appMode === 'GRAPH' ? (
            <>
              {/* Expression Line with Cursor */}
              <div 
                ref={displayRef}
                className="text-[#2a3a38] text-xl overflow-x-auto whitespace-nowrap scrollbar-hide text-left mt-1 sm:mt-2 flex items-center min-h-[28px]"
              >
                {appMode === 'GRAPH' && <span className="mr-1">f(x)=</span>}
                <span>{display.slice(0, cursorPos)}</span>
                <span className="w-[2px] h-5 bg-[#2a3a38] animate-pulse"></span>
                <span>{display.slice(cursorPos)}</span>
              </div>

              {/* Result Line */}
              <div className="text-[#1a2a28] text-2xl sm:text-3xl text-right font-bold tracking-tighter">
                {error ? (
                  <span className="text-red-800 text-lg sm:text-xl">{error}</span>
                ) : (
                  result || (appMode === 'GRAPH' ? '' : '0')
                )}
              </div>
            </>
          ) : appMode === 'CONV' ? (
            <div className="flex flex-col h-full justify-center">
              <div className="text-[#2a3a38] text-xs sm:text-sm font-bold mb-1">{convCategory}</div>
              <div className="flex justify-between items-center text-[#1a2a28] text-lg sm:text-xl font-bold">
                <span>{convValue} {convFrom}</span>
                <span className="text-xs sm:text-sm">=</span>
                <span>{convResult}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full justify-center text-[#1a2a28]">
              <div className="text-xs sm:text-sm font-bold">Constants Mode</div>
              <div className="text-[10px] sm:text-xs">Select a constant from the menu</div>
            </div>
          )}
        </div>

        {/* Keypad Area */}
        <div className="flex-1 flex flex-col justify-between gap-2 px-1 pb-2">
          {/* Top Control Buttons */}
          <div className="grid grid-cols-5 grid-rows-1 gap-2 flex-[0.15]">
            <CalcButton 
              onClick={() => setIsShift(!isShift)} 
              className={cn('bg-[#4b5563] text-yellow-500 text-[10px]', isShift && 'ring-2 ring-yellow-500')}
            >
              SHIFT
            </CalcButton>
            <CalcButton 
              onClick={() => setIsAlpha(!isAlpha)} 
              className={cn('bg-[#4b5563] text-red-400 text-[10px]', isAlpha && 'ring-2 ring-red-400')}
            >
              ALPHA
            </CalcButton>
            
            {/* D-Pad */}
            <div className="col-span-1 flex flex-col items-center justify-start relative z-10">
              <div className="bg-[#2a2d32] w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-lg border border-black/50 relative overflow-hidden -mt-2 sm:-mt-4 shrink-0">
                <button onClick={moveHistoryUp} className="absolute top-0 w-full h-1/3 flex justify-center items-start pt-1 hover:bg-white/10 transition-colors"><ChevronUp size={14} className="text-white/70" /></button>
                <button onClick={moveHistoryDown} className="absolute bottom-0 w-full h-1/3 flex justify-center items-end pb-1 hover:bg-white/10 transition-colors"><ChevronDown size={14} className="text-white/70" /></button>
                <button onClick={moveCursorLeft} className="absolute left-0 h-full w-1/3 flex justify-start items-center pl-1 hover:bg-white/10 transition-colors"><ChevronLeft size={14} className="text-white/70" /></button>
                <button onClick={moveCursorRight} className="absolute right-0 h-full w-1/3 flex justify-end items-center pr-1 hover:bg-white/10 transition-colors"><ChevronRight size={14} className="text-white/70" /></button>
                <div className="absolute inset-0 m-auto w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#1a1c20] pointer-events-none shadow-inner flex items-center justify-center">
                  <span className="text-[4px] sm:text-[5px] text-white/30 font-bold">REPLAY</span>
                </div>
              </div>
            </div>

            <CalcButton labelTop="CLR" onClick={() => setIsModeMenuOpen(true)} className="bg-[#4b5563] text-white text-[10px] ring-1 ring-white/20">MODE</CalcButton>
            <CalcButton onClick={clearAll} className="bg-[#4b5563] text-white text-[10px]">ON</CalcButton>
          </div>

          {/* Function Keys Grid */}
          <div className="grid grid-cols-6 grid-rows-2 gap-x-1.5 gap-y-1.5 flex-[0.25]">
          <CalcButton labelTop="SOLVE" labelAlpha="=" onClick={() => handleInput('', '', '=')} variant="function">CALC</CalcButton>
          <CalcButton labelTop="d/dx" labelAlpha=":" onClick={() => handleInput('∫(', 'd/dx(', ':')} variant="function">∫dx</CalcButton>
          <CalcButton labelTop="x!" onClick={() => handleInput('^-1', '!')} variant="function">x⁻¹</CalcButton>
          <CalcButton labelTop="nPr" onClick={() => handleInput('C', 'P')} variant="function">nCr</CalcButton>
          <CalcButton labelTop="Rec(" onClick={() => handleInput('Pol(', 'Rec(')} variant="function">Pol(</CalcButton>
          <CalcButton labelTop="³√" onClick={() => handleInput('^3', '³√(')} variant="function">x³</CalcButton>

          <CalcButton labelTop="d/c" onClick={() => handleInput('/')} variant="function">a b/c</CalcButton>
          <CalcButton labelTop="x√" onClick={() => handleInput('√(', 'x√(')} variant="function">√</CalcButton>
          <CalcButton labelTop="x³" onClick={() => handleInput('^2', '^3')} variant="function">x²</CalcButton>
          <CalcButton labelTop="x√" onClick={() => handleInput('^', 'x√(')} variant="function">^</CalcButton>
          <CalcButton labelTop="10ˣ" onClick={() => handleInput('log(', '10^')} variant="function">log</CalcButton>
          <CalcButton labelTop="eˣ" labelAlpha="e" onClick={() => handleInput('ln(', 'e^', 'e')} variant="function">ln</CalcButton>

          <CalcButton labelTop="A" labelAlpha="A" onClick={() => handleInput('-', '', 'A')} variant="function">(-)</CalcButton>
          <CalcButton labelTop="B" labelAlpha="B" onClick={() => handleInput('deg', '', 'B')} variant="function">.,,,</CalcButton>
          <CalcButton labelTop="C" labelAlpha="C" onClick={() => handleInput('hyp', '', 'C')} variant="function">hyp</CalcButton>
          <CalcButton labelTop="sin⁻¹" labelAlpha="D" onClick={() => handleInput('sin(', 'asin(', 'D')} variant="function">sin</CalcButton>
          <CalcButton labelTop="cos⁻¹" labelAlpha="E" onClick={() => handleInput('cos(', 'acos(', 'E')} variant="function">cos</CalcButton>
          <CalcButton labelTop="tan⁻¹" labelAlpha="F" onClick={() => handleInput('tan(', 'atan(', 'F')} variant="function">tan</CalcButton>

          <CalcButton labelTop="STO" onClick={() => handleInput('RCL', 'STO')} variant="function">RCL</CalcButton>
          <CalcButton labelTop="←" onClick={() => handleInput('ENG')} variant="function">ENG</CalcButton>
          <CalcButton labelTop="(" labelAlpha="X" onClick={() => handleInput('(', '', 'X')} variant="function">(</CalcButton>
          <CalcButton labelTop=")" labelAlpha="Y" onClick={() => handleInput(')', '', 'Y')} variant="function">)</CalcButton>
          <CalcButton labelTop="," labelAlpha="M" onClick={() => handleInput(',', '', 'M')} variant="function">,</CalcButton>
          <CalcButton labelTop="M-" labelAlpha="M" onClick={() => handleMemory('M+')} variant="function">M+</CalcButton>
          </div>

          {/* Main Keypad */}
          <div className="grid grid-cols-5 grid-rows-5 gap-1.5 sm:gap-2.5 flex-[0.6]">
            <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '7') : handleInput('7')}>7</CalcButton>
          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '8') : handleInput('8')}>8</CalcButton>
          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '9') : handleInput('9')}>9</CalcButton>
          <CalcButton variant="control" className="bg-[#e11d48] text-xs sm:text-sm" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev.slice(0, -1)) : backspace()}>DEL</CalcButton>
          <CalcButton variant="control" className="bg-[#e11d48] text-xs sm:text-sm" onClick={() => appMode === 'CONV' ? setConvValue('') : clearAll()}>AC</CalcButton>

          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '4') : handleInput('4')}>4</CalcButton>
          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '5') : handleInput('5')}>5</CalcButton>
          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '6') : handleInput('6')}>6</CalcButton>
          <CalcButton variant="default" className="text-xl sm:text-2xl" onClick={() => handleInput('×')}>×</CalcButton>
          <CalcButton variant="default" className="text-xl sm:text-2xl" onClick={() => handleInput('÷')}>÷</CalcButton>

          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '1') : handleInput('1')}>1</CalcButton>
          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '2') : handleInput('2')}>2</CalcButton>
          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '3') : handleInput('3')}>3</CalcButton>
          <CalcButton variant="default" className="text-xl sm:text-2xl" onClick={() => handleInput('+')}>+</CalcButton>
          <CalcButton variant="default" className="text-xl sm:text-2xl" onClick={() => handleInput('-')}>-</CalcButton>

          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '0') : handleInput('0')}>0</CalcButton>
          <CalcButton variant="numpad" onClick={() => appMode === 'CONV' ? setConvValue(prev => prev + '.') : handleInput('.')}>.</CalcButton>
          <CalcButton variant="numpad" labelTop="DRG" onClick={() => handleInput('EXP', 'DRG')}>EXP</CalcButton>
            <CalcButton variant="numpad" labelTop="π" labelAlpha="e" onClick={() => handleInput('Ans', 'π', 'e')}>Ans</CalcButton>
            <CalcButton variant="numpad" labelTop="≈" onClick={handleCalculate}>=</CalcButton>
          </div>
        </div>

        {/* Mode Menu Overlay */}
        <AnimatePresence>
          {isModeMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 bg-[#2a2d32]/95 backdrop-blur-md z-50 p-6 flex flex-col rounded-[2.5rem]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-bold text-xl">Select Mode</h3>
                <button onClick={() => setIsModeMenuOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><X className="text-white" size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => { setAppMode('CALC'); setIsModeMenuOpen(false); }}
                  className={cn("p-4 rounded-xl flex flex-col items-center gap-2 transition-colors", appMode === 'CALC' ? "bg-blue-500 text-white" : "bg-white/5 text-white/70 hover:bg-white/10")}
                >
                  <div className="text-2xl font-bold">1</div>
                  <span className="text-sm font-medium">COMP</span>
                </button>
                <button 
                  onClick={() => { setAppMode('GRAPH'); setIsModeMenuOpen(false); }}
                  className={cn("p-4 rounded-xl flex flex-col items-center gap-2 transition-colors", appMode === 'GRAPH' ? "bg-blue-500 text-white" : "bg-white/5 text-white/70 hover:bg-white/10")}
                >
                  <Activity size={24} />
                  <span className="text-sm font-medium">GRAPH</span>
                </button>
                <button 
                  onClick={() => { setAppMode('CONV'); setIsModeMenuOpen(false); }}
                  className={cn("p-4 rounded-xl flex flex-col items-center gap-2 transition-colors", appMode === 'CONV' ? "bg-blue-500 text-white" : "bg-white/5 text-white/70 hover:bg-white/10")}
                >
                  <ArrowRightLeft size={24} />
                  <span className="text-sm font-medium">CONV</span>
                </button>
                <button 
                  onClick={() => { setAppMode('CONST'); setIsModeMenuOpen(false); }}
                  className={cn("p-4 rounded-xl flex flex-col items-center gap-2 transition-colors", appMode === 'CONST' ? "bg-blue-500 text-white" : "bg-white/5 text-white/70 hover:bg-white/10")}
                >
                  <Atom size={24} />
                  <span className="text-sm font-medium">CONST</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Graph Overlay */}
        <AnimatePresence>
          {appMode === 'GRAPH' && graphData.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-x-4 top-32 bottom-24 bg-white rounded-xl z-40 p-2 shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-xs font-bold text-gray-800">f(x) = {display}</span>
                <button onClick={() => setGraphData([])} className="p-1 bg-gray-200 rounded-full"><X size={12} /></button>
              </div>
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={graphData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={{fontSize: 10}} />
                    <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} />
                    <Tooltip contentStyle={{ fontSize: '12px', padding: '4px' }} />
                    <Line type="monotone" dataKey="y" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Converter Overlay */}
        <AnimatePresence>
          {appMode === 'CONV' && !isModeMenuOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-4 top-32 bottom-56 bg-[#2a2d32] rounded-xl z-40 p-4 shadow-2xl flex flex-col gap-4 border border-white/10"
            >
              <div className="flex justify-between items-center">
                <span className="text-white font-bold">Unit Converter</span>
                <button onClick={() => setAppMode('CALC')} className="p-1 bg-white/10 rounded-full"><X size={14} className="text-white" /></button>
              </div>
              
              <div className="flex flex-col gap-3">
                <select 
                  value={convCategory} 
                  onChange={(e) => handleCategoryChange(e.target.value as any)}
                  className="bg-[#1a1c20] text-white p-2 rounded-lg border border-white/10 text-sm outline-none"
                >
                  {Object.keys(UNIT_CATEGORIES).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <select 
                    value={convFrom} 
                    onChange={(e) => setConvFrom(e.target.value)}
                    className="flex-1 bg-[#1a1c20] text-white p-2 rounded-lg border border-white/10 text-sm outline-none"
                  >
                    {UNIT_CATEGORIES[convCategory as keyof typeof UNIT_CATEGORIES].map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                  <ArrowRightLeft size={16} className="text-white/50" />
                  <select 
                    value={convTo} 
                    onChange={(e) => setConvTo(e.target.value)}
                    className="flex-1 bg-[#1a1c20] text-white p-2 rounded-lg border border-white/10 text-sm outline-none"
                  >
                    {UNIT_CATEGORIES[convCategory as keyof typeof UNIT_CATEGORIES].map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Constants Overlay */}
        <AnimatePresence>
          {appMode === 'CONST' && !isModeMenuOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-4 top-32 bottom-24 bg-[#2a2d32] rounded-xl z-40 p-4 shadow-2xl flex flex-col border border-white/10"
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-white font-bold">Scientific Constants</span>
                <button onClick={() => setAppMode('CALC')} className="p-1 bg-white/10 rounded-full"><X size={14} className="text-white" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-white/20">
                {SCIENTIFIC_CONSTANTS.map((c, i) => (
                  <button 
                    key={i}
                    onClick={() => {
                      handleInput(c.value);
                      setAppMode('CALC');
                    }}
                    className="w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex flex-col gap-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-yellow-500 font-bold font-mono">{c.symbol}</span>
                      <span className="text-white/50 text-xs">{c.unit}</span>
                    </div>
                    <span className="text-white/80 text-xs">{c.name}</span>
                    <span className="text-white font-mono text-sm">{c.value}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Button (Floating) */}
        <button 
          onClick={() => setIsHistoryOpen(true)}
          className="absolute bottom-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors text-white/40"
        >
          <History size={16} />
        </button>

        {/* History Overlay */}
        <AnimatePresence>
          {isHistoryOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 p-6 flex flex-col rounded-[2.5rem]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-bold text-lg">History</h3>
                <button onClick={() => setIsHistoryOpen(false)}><X className="text-white" /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4">
                {history.map((item, i) => (
                  <div key={i} className="bg-white/5 p-3 rounded-lg">
                    <div className="text-white/40 text-xs font-mono">{item.expression}</div>
                    <div className="text-white text-lg font-bold">{item.result}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
