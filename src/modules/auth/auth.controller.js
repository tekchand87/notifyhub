import * as authService from "./auth.service.js"

export const register = async (req,res,next)=>{
  try{
    return res.status(201).json({
      success : true,
      message : "Registration successful",
      data : result
    });
  }catch(error){
    next(error)
  }
}

export const login = async(req,res,next)=>{
  try{
    const result = await authService.login(req.body);

    return res.status(200).json({
      sucess : true,
      message : " Login successfull",
      data : result 
    });
  }catch(error){
    next(error);
  }
};

export const getMe = async(req,res,next)=>{
  try{
    const user = await authService.getCurrentUser(req.user.userId)

    return res.status(200).json({
      sucess : true,
      message : "Current user fetch successfully",
      datat : {user}
  });
  }catch(error){
    next(error);
  }
};

export const changePassword = async(req,res,next)=>{
  try{
    const result = await authService.changePassword(req.user.userId,req.body.currentPassword,req.body.newPassword);

    return res.status(200).json({
      sucess : true,
      resutl
    });
  }catch(error){
    next(error);
  }
}